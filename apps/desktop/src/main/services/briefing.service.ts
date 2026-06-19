import type OpenAI from 'openai'
import type { QdrantClient } from '@qdrant/js-client-rest'
import type { AnticipatedQuestion, BriefingResponse } from '@nerd/shared'
import { computeSparseVector } from '@nerd/shared'

const COLLECTION = 'nerd-chunks'
const GENERATION_MODEL = process.env['OPENAI_GENERATION_MODEL'] ?? 'gpt-4o'

interface ParsedBriefing {
  briefing?: string
  anticipatedQuestions?: AnticipatedQuestion[]
}

export class BriefingService {
  constructor(
    private readonly openai: OpenAI,
    private readonly qdrant: QdrantClient
  ) {}

  async generateBriefing(
    meetingDescription: string,
    systemPrompt: string
  ): Promise<BriefingResponse> {
    // 1. Embed meeting description
    const embedResp = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: meetingDescription
    })
    const denseVector = embedResp.data[0]?.embedding ?? []
    const sparseVec = computeSparseVector(meetingDescription)

    // 2. Retrieve top 30 chunks
    const result = (await this.qdrant.query(COLLECTION, {
      prefetch: [
        { query: denseVector, using: 'dense', limit: 30 },
        {
          query: { indices: sparseVec.indices, values: sparseVec.values },
          using: 'sparse',
          limit: 30
        }
      ],
      query: { fusion: 'rrf' },
      limit: 30,
      with_payload: true,
      with_vector: false
    })) as { points: Array<{ payload?: Record<string, unknown> | null }> }

    const points = result?.points ?? []

    // 3. Deduplicate and pack context (~10k token budget ≈ 30 chunks × ~200 tokens each)
    const seen = new Set<string>()
    const contextChunks = points
      .map((r) => {
        const payload = (r.payload ?? {}) as Record<string, unknown>
        const text = (payload['text'] as string) ?? ''
        const source = (payload['docTitle'] as string | null) ?? (payload['source'] as string) ?? ''
        return { text, source }
      })
      .filter((c) => {
        const key = c.text.slice(0, 80).toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return c.text.length > 50
      })
      .slice(0, 25)

    const contextBlock = contextChunks
      .map((c, i) => `[${i + 1}] ${c.source}\n${c.text}`)
      .join('\n\n---\n\n')

    // 4. Generate briefing with structured output
    const resp = await this.openai.chat.completions.create({
      model: GENERATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\n\nYou are preparing a pre-call briefing. Respond ONLY with valid JSON matching this schema exactly:\n{"briefing": "string (200 words max)", "anticipatedQuestions": [{"question": "string", "answer": "string (concise, cite source)", "source": "string"}]}\nGenerate exactly 3 anticipated questions. No markdown, no explanation outside the JSON.`
        },
        {
          role: 'user',
          content: `Meeting description: ${meetingDescription}\n\nKnowledge base context:\n${contextBlock}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1200
    })

    const raw = resp.choices[0]?.message?.content ?? '{}'
    let parsed: ParsedBriefing
    try {
      parsed = JSON.parse(raw) as ParsedBriefing
    } catch {
      parsed = {}
    }

    return {
      briefing: parsed.briefing ?? 'Could not generate briefing.',
      anticipatedQuestions: parsed.anticipatedQuestions ?? [],
      contextAge: 'unknown',
      sourcesLoaded: contextChunks.length
    }
  }
}
