import OpenAI from 'openai'
import type { ChatTurn } from '@shared/types'
import { ENV } from '../config/env'
import { assembleToolCalls } from './sqlTool-core'
import { MAX_HISTORY_TURNS } from '@shared/history'

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

export type ToolExecutor = (name: string, args: string, signal?: AbortSignal) => Promise<string>

const MAX_TOOL_ROUNDS = 3

/**
 * Streams generated text deltas while letting the model call `tools` mid-turn. Tool-call
 * turns produce no user-facing content, so we only yield real answer text. The final round
 * forces `tool_choice: 'none'` so the loop always terminates with an answer.
 */
export async function* generateWithTools(
  system: string,
  user: string,
  history: ChatTurn[],
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  exec: ToolExecutor,
  signal?: AbortSignal
): AsyncGenerator<string> {
  // Defensive cap: the renderer already trims, but never let history outgrow the budget.
  const recent = history.slice(-MAX_HISTORY_TURNS * 2)
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...recent.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: user }
  ]

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const tool_choice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption =
      round < MAX_TOOL_ROUNDS ? 'auto' : 'none'
    const stream = await oai().chat.completions.create(
      { model: ENV.genModel, stream: true, messages, tools, tool_choice },
      { signal }
    )

    const toolDeltas: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] = []
    let finish: string | null = null
    let content = ''
    for await (const part of stream) {
      const choice = part.choices[0]
      if (!choice) continue
      if (choice.delta.content) {
        content += choice.delta.content
        yield choice.delta.content
      }
      if (choice.delta.tool_calls) toolDeltas.push(...choice.delta.tool_calls)
      if (choice.finish_reason) finish = choice.finish_reason
    }

    if (finish !== 'tool_calls') return

    const calls = assembleToolCalls(toolDeltas)
    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments }
      }))
    })
    for (const c of calls) {
      messages.push({
        role: 'tool',
        tool_call_id: c.id,
        content: await exec(c.name, c.arguments, signal)
      })
    }
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
