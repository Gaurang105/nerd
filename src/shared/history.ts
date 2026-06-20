import type { ChatTurn } from './types'

// Pure, dependency-free helper (type-only import) so it runs under tsx, matching the
// rerank-core / transcriptBuffer.check.ts convention.

export const MAX_HISTORY_TURNS = 6
export const HISTORY_ANSWER_TRUNC = 800

/** A completed Q&A turn from the renderer thread. `error` marks failed/cancelled turns. */
export interface HistoryTurn {
  question: string | null
  answer: string
  error?: string
}

/**
 * Flatten completed turns into alternating user/assistant messages for replay. Drops
 * in-flight (no question), errored, and empty turns; keeps the last `maxTurns`; truncates
 * long answers so a big printed list (e.g. 130 rows) does not blow the context — the model
 * re-derives any follow-up query from the prior question text.
 */
export function buildHistory(
  turns: HistoryTurn[],
  maxTurns = MAX_HISTORY_TURNS,
  maxChars = HISTORY_ANSWER_TRUNC
): ChatTurn[] {
  const usable = turns.filter((t) => t.question != null && t.answer.trim() !== '' && !t.error)
  const recent = usable.slice(-maxTurns)
  const out: ChatTurn[] = []
  for (const t of recent) {
    out.push({ role: 'user', content: t.question as string })
    const answer = t.answer.length > maxChars ? `${t.answer.slice(0, maxChars)}…` : t.answer
    out.push({ role: 'assistant', content: answer })
  }
  return out
}
