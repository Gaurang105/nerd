import type OpenAI from 'openai'
import type { SqlResult } from '@shared/types'

// Pure, dependency-free helpers for the SQL tool-calling feature. Kept separate from
// sqlTool.ts / openai.ts (which import env + network clients) so the self-check can run
// under plain tsx. Mirrors the rerank.ts / rerank-core.ts split.

export interface AssembledToolCall {
  id: string
  name: string
  arguments: string
}

type ToolCallDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall

/** Merge streamed tool_call deltas (keyed by `index`) into complete calls. */
export function assembleToolCalls(deltas: ToolCallDelta[]): AssembledToolCall[] {
  const byIndex = new Map<number, AssembledToolCall>()
  for (const d of deltas) {
    const cur = byIndex.get(d.index) ?? { id: '', name: '', arguments: '' }
    if (d.id) cur.id = d.id
    if (d.function?.name) cur.name = d.function.name
    if (d.function?.arguments) cur.arguments += d.function.arguments
    byIndex.set(d.index, cur)
  }
  return [...byIndex.keys()].sort((a, b) => a - b).map((i) => byIndex.get(i) as AssembledToolCall)
}

/**
 * Defense-in-depth read-only guard. The gateway `/sql` endpoint is the real boundary;
 * this just rejects obvious writes before they ever leave the app.
 */
export function isReadOnly(sql: string): boolean {
  const s = sql.trim().toLowerCase()
  return s.startsWith('select') || s.startsWith('with')
}

/**
 * Shape DB rows into a SqlResult for deterministic rendering. Columns come from the first
 * row's keys; rows are capped to `displayCap` while `rowCount` keeps the true total.
 */
export function toSqlResult(
  sql: string,
  rows: Record<string, unknown>[],
  displayCap: number
): SqlResult {
  const display = rows.slice(0, displayCap)
  const columns = display.length > 0 ? Object.keys(display[0]) : []
  return { sql, columns, rows: display, rowCount: rows.length, truncated: rows.length > display.length }
}
