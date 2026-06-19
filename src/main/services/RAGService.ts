import type { AnswerSource, FinalAnswer, OutputFormat, PartialAnswer } from '@shared/types'
import { embed, generate, rewriteQuery } from './openai'
import { searchChunks } from './qdrant'
import { rerank, selectTop } from './rerank'
import { buildUserPrompt } from './prompts'
import { getActiveSystemPrompt } from '../mode/ModeService'
import { stage } from '../util/timeout'

const BUDGET = { rewrite: 250, embed: 300, retrieve: 500, rerank: 400 }
const WALL_CLOCK_MS = 12_000

export interface AnswerRequest {
  requestId: number
  question: string
  format: OutputFormat
  /** Clean up the text into a question first (hotkey transcript). Off for typed Q&A. */
  rewrite: boolean
  /** RECENT TRANSCRIPT block (hotkey flow). */
  transcript?: string
  /** RECENT ANSWERS block to avoid repetition. */
  answerMemory?: string
  /** Resolves the SCREEN OCR text; awaited in parallel with rewrite/embed. */
  screenText?: Promise<string>
  signal: AbortSignal
  onDelta: (p: PartialAnswer) => void
}

export async function answer(req: AnswerRequest): Promise<FinalAnswer> {
  const { requestId, format, signal, onDelta } = req
  const safety = new AbortController()
  const onAbort = (): void => safety.abort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  const wallTimer = setTimeout(
    () => safety.abort(new Error('pipeline wall-clock exceeded')),
    WALL_CLOCK_MS
  )

  try {
    let question = req.question
    if (req.rewrite) {
      try {
        question = await stage('rewrite', BUDGET.rewrite, safety.signal, (s) =>
          rewriteQuery(req.question, s)
        )
      } catch {
        question = req.question // degrade: embed the raw transcript slice
      }
    }

    const vector = await stage('embed', BUDGET.embed, safety.signal, (s) => embed(question, s))

    let chunks = await stage('retrieve', BUDGET.retrieve, safety.signal, () =>
      searchChunks(vector, 20)
    ).catch((err) => {
      console.error('[RAG] retrieve failed, going KB-less', err)
      return []
    })

    if (chunks.length > 0) {
      chunks = await stage('rerank', BUDGET.rerank, safety.signal, (s) =>
        rerank(question, chunks, s)
      ).catch((err) => {
        console.error('[RAG] rerank failed, using fused order', err)
        return selectTop(chunks)
      })
    }

    const grounded = chunks.length > 0
    const sources: AnswerSource[] = chunks.map((c) => ({
      docTitle: c.docTitle,
      url: c.url,
      source: c.source
    }))

    // Screen OCR ran in parallel (kicked at hotkey); collect it now, best-effort.
    let screenText = '(none)'
    if (req.screenText) {
      screenText = await req.screenText.catch(() => '')
    }

    const userPrompt = buildUserPrompt({
      question,
      chunks,
      format,
      screenText,
      transcript: req.transcript,
      answerMemory: req.answerMemory
    })
    let text = ''
    for await (const delta of generate(getActiveSystemPrompt(), userPrompt, safety.signal)) {
      if (safety.signal.aborted) break
      text += delta
      onDelta({ requestId, delta })
    }

    return { requestId, text, sources, grounded, format }
  } catch (err) {
    return {
      requestId,
      text: '',
      sources: [],
      grounded: false,
      format,
      error: signal.aborted ? 'cancelled' : (err as Error).message || 'context unavailable'
    }
  } finally {
    clearTimeout(wallTimer)
    signal.removeEventListener('abort', onAbort)
  }
}
