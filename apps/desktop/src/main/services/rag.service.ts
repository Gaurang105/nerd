import type OpenAI from 'openai'
import type { QdrantClient } from '@qdrant/js-client-rest'
import type { CohereClient } from 'cohere-ai'
import type { AnswerToken, Citation, OutputFormat, SourceKind } from '@nerd/shared'
import { computeSparseVector } from '@nerd/shared'

const COLLECTION = 'nerd-chunks'
const GENERATION_MODEL = process.env['OPENAI_GENERATION_MODEL'] ?? 'gpt-4o'
const REWRITE_MODEL = process.env['OPENAI_REWRITE_MODEL'] ?? 'gpt-4o-mini'
const RERANK_MODEL = process.env['COHERE_RERANK_MODEL'] ?? 'rerank-english-v3.0'
const SCORE_THRESHOLD = 0.1

export interface RetrievedChunk {
  id: string
  text: string
  docId: string
  docTitle: string | null
  url: string | null
  source: string
  score: number
}

export interface GenerateAnswerOptions {
  question: string
  chunks: RetrievedChunk[]
  screenText: string
  transcriptContext: string
  outputFormat: OutputFormat
  systemPrompt: string
  requestId: string
}

export class RAGService {
  constructor(
    private readonly openai: OpenAI,
    private readonly qdrant: QdrantClient,
    private readonly cohere: CohereClient
  ) {}

  async rewriteQuery(transcriptSlice: string, signal: AbortSignal): Promise<string> {
    const resp = await this.openai.chat.completions.create(
      {
        model: REWRITE_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the following conversation excerpt into a clean, specific search query. Return only the query, nothing else.'
          },
          { role: 'user', content: transcriptSlice }
        ],
        max_tokens: 100,
        temperature: 0
      },
      { signal }
    )
    return resp.choices[0]?.message?.content?.trim() ?? transcriptSlice
  }

  async embedQuery(question: string, signal: AbortSignal): Promise<number[]> {
    const resp = await this.openai.embeddings.create(
      {
        model: 'text-embedding-3-small',
        input: question
      },
      { signal }
    )
    return resp.data[0]?.embedding ?? []
  }

  async retrieveChunks(
    denseVector: number[],
    question: string,
    signal: AbortSignal
  ): Promise<RetrievedChunk[]> {
    const sparseVec = computeSparseVector(question)

    const queryPromise = this.qdrant.query(COLLECTION, {
      prefetch: [
        { query: denseVector, using: 'dense', limit: 20 },
        {
          query: { indices: sparseVec.indices, values: sparseVec.values },
          using: 'sparse',
          limit: 20
        }
      ],
      query: { fusion: 'rrf' },
      limit: 20,
      with_payload: true,
      with_vector: false
    })

    const abortPromise = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })

    const result = (await Promise.race([queryPromise, abortPromise])) as { points: unknown[] }
    const points = (result?.points ?? []) as Array<{
      id: string | number
      score?: number
      payload?: Record<string, unknown> | null
    }>

    return points.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      return {
        id: String(r.id),
        text: (payload['text'] as string) ?? '',
        docId: (payload['docId'] as string) ?? '',
        docTitle: (payload['docTitle'] as string | null) ?? null,
        url: (payload['url'] as string | null) ?? null,
        source: (payload['source'] as string) ?? '',
        score: r.score ?? 0
      }
    })
  }

  private dedup(chunks: RetrievedChunk[]): RetrievedChunk[] {
    const seen = new Set<string>()
    return chunks.filter((c) => {
      // Dedup by first 100 chars of text (catches Slack repeats)
      const key = c.text.slice(0, 100).toLowerCase().replace(/\s+/g, ' ')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async rerankChunks(
    chunks: RetrievedChunk[],
    question: string,
    _signal: AbortSignal
  ): Promise<RetrievedChunk[]> {
    if (chunks.length === 0) return []

    const deduped = this.dedup(chunks)

    try {
      const result = await this.cohere.rerank({
        model: RERANK_MODEL,
        query: question,
        documents: deduped.map((c) => c.text),
        topN: 8
      })

      return (result.results ?? [])
        .filter((r) => (r.relevanceScore ?? 0) >= SCORE_THRESHOLD)
        .map((r) => deduped[r.index])
        .filter((c): c is RetrievedChunk => Boolean(c))
    } catch {
      // Cohere unavailable — return top 5 from fusion score
      return deduped.slice(0, 5)
    }
  }

  async *generateAnswer(
    opts: GenerateAnswerOptions,
    signal: AbortSignal
  ): AsyncGenerator<AnswerToken> {
    const {
      question,
      chunks,
      screenText,
      transcriptContext,
      outputFormat,
      systemPrompt,
      requestId
    } = opts

    const formatInstruction =
      outputFormat === 'list'
        ? 'Format your answer as terse bullet points. Lead with the key number or fact.'
        : 'Format your answer as clear prose ready to speak aloud.'

    const contextBlock = chunks
      .map(
        (c, i) => `[${i + 1}] Source: ${c.docTitle ?? c.source} (${c.url ?? 'no url'})\n${c.text}`
      )
      .join('\n\n---\n\n')

    const userPrompt = [
      `CONTEXT:\n${contextBlock || '(no retrieved context)'}`,
      `SCREEN (live, on user's display right now):\n${screenText || '(none)'}`,
      `RECENT TRANSCRIPT:\n${transcriptContext}`,
      `QUESTION (implied): ${question}`
    ].join('\n\n')

    const stream = await this.openai.chat.completions.create(
      {
        model: GENERATION_MODEL,
        messages: [
          { role: 'system', content: `${systemPrompt}\n\n${formatInstruction}` },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        max_tokens: 600,
        temperature: 0.1
      },
      { signal }
    )

    const citations: Citation[] = chunks.map((c) => ({
      docId: c.docId,
      docTitle: c.docTitle,
      url: c.url,
      source: c.source as SourceKind
    }))

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      if (token) {
        yield { requestId, token, done: false }
      }
    }

    yield { requestId, token: '', done: true, citations }
  }
}
