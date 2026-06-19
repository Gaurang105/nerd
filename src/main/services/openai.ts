import OpenAI from 'openai'
import { ENV } from '../config/env'

let client: OpenAI | null = null
function oai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: ENV.openaiApiKey })
  return client
}

export async function embed(text: string, signal?: AbortSignal): Promise<number[]> {
  const res = await oai().embeddings.create({ model: ENV.embedModel, input: text }, { signal })
  return res.data[0].embedding
}

const REWRITE_SYSTEM =
  'Rewrite the messy meeting transcript slice below into a single clean search ' +
  'question (no filler, no speaker tags). If it is already a clean question, return it ' +
  'unchanged. Output only the question.'

// HyDE: a fake answer sits closer to real answer chunks in vector space than a question.
const HYDE_SYSTEM =
  'From the messy meeting transcript slice below, infer the question being asked and ' +
  'write a single concise hypothetical answer sentence (it does not need to be correct). ' +
  'Output only that sentence — it will be embedded for retrieval.'

export async function rewriteQuery(transcript: string, signal?: AbortSignal): Promise<string> {
  const res = await oai().chat.completions.create(
    {
      model: ENV.rewriteModel,
      messages: [
        { role: 'system', content: ENV.useHyde ? HYDE_SYSTEM : REWRITE_SYSTEM },
        { role: 'user', content: transcript }
      ]
    },
    { signal }
  )
  return res.choices[0]?.message?.content?.trim() || transcript
}

/** Streams generated text deltas. Caller assembles the full string. */
export async function* generate(
  system: string,
  user: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const stream = await oai().chat.completions.create(
    {
      model: ENV.genModel,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    },
    { signal }
  )
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content
    if (delta) yield delta
  }
}

/** Non-streaming generation that returns parsed JSON (used by the briefing). */
export async function generateJSON<T>(
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<T> {
  const res = await oai().chat.completions.create(
    {
      model: ENV.genModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    },
    { signal }
  )
  return JSON.parse(res.choices[0]?.message?.content || '{}') as T
}
