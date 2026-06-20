import type { OutputFormat, RetrievedChunk } from '@shared/types'

// The default generation system prompt (ERD). An active Mode replaces this block
// verbatim; the CONTEXT / TRANSCRIPT assembly is appended either way.
export const DEFAULT_SYSTEM_PROMPT = `You are Nerd, a real-time assistant for a Headout employee on a live call.

The user just asked a question. Below is the recent context and retrieved context from
Headout's internal knowledge base.

Answer the question. Use THREE sources of truth:
1. The DATABASE (via the query_database tool) — authoritative for structured/operational
   data from analytics tables: revenue, bookings, inventory, product metadata. Use it for
   counts/filters/aggregations ONLY when the question is about data that lives in a database
   table (e.g. booking counts, product info). Do NOT use it for questions about Slack
   conversations, MMP execution status, SRC blocked stage, BizOps updates, or anything
   that comes from team communication — that data lives in CONTEXT, not the DB.
2. Headout's internal knowledge base (the CONTEXT below) — authoritative for Slack-sourced
   information: MMP execution status, SRC blocked counts, BizOps updates, team discussions,
   handover notes, market performance updates. Always check CONTEXT first for any question
   about MMP pipeline, SRC stage, execution blockers, or market channel updates.
3. Your own general knowledge — to fill gaps, explain concepts, or answer anything the
   others do not cover.

Rules:
- Be concise. Lead with the exact number or fact.
- Attribute every fact to its source: DB query, CONTEXT (cite it), or say plainly
  it is general knowledge. Never blend a real Headout number with an invented one.
- When a Headout-specific fact (a number, policy, SLA, price) is NOT in the DATABASE
  or CONTEXT, do NOT invent it — say "I don't have that data — check with ops."
- General/conceptual answers from your own knowledge are fine, but make clear they are
  general guidance, not Headout's confirmed data.`

export function formatInstruction(format: OutputFormat): string {
  return format === 'list'
    ? 'Answer as a bullet list: one item per line, each line starting with "- ". Keep each ' +
        'bullet terse — just the number/hook. Never put multiple items on one line.'
    : 'Answer as fully paraphrased, ready-to-speak prose.'
}

export function contextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '(none)'
  return chunks
    .map((c, i) => {
      const ch = c.channelName || c.source
      return `[${i + 1}] (${ch} — ${c.docTitle || 'untitled'})\n${c.text}`
    })
    .join('\n\n')
}

export interface UserPromptParts {
  question: string
  chunks: RetrievedChunk[]
  format: OutputFormat
  /** RECENT TRANSCRIPT block (hotkey flow); '(none)' for manual Q&A. */
  transcript?: string
  /** RECENT ANSWERS block to avoid repetition. */
  answerMemory?: string
  /** Compact public-schema description; enables the query_database tool. */
  schema?: string
}

export function buildUserPrompt({
  question,
  chunks,
  format,
  transcript = '(none)',
  answerMemory = '(none)',
  schema = ''
}: UserPromptParts): string {
  return `${formatInstruction(format)}

CONTEXT:
${contextBlock(chunks)}

DATABASE (use query_database ONLY for analytics/operational data in the tables below — bookings, revenue, products, inventory. Do NOT query the DB for Slack-sourced data like MMP execution status, SRC blocked counts, or BizOps updates — that data is in CONTEXT above. The app renders rows as a table, so give only a brief summary. Tables:):
${schema || '(unavailable)'}

RECENT TRANSCRIPT:
${transcript || '(none)'}

RECENT ANSWERS (do not repeat these):
${answerMemory || '(none)'}

QUESTION:
${question}

CITATIONS: After your answer, output one final line exactly in this form: SOURCES: [n, n] — listing only the bracketed CONTEXT item numbers you actually used. If you used no CONTEXT items, output SOURCES: []. Put nothing after this line.`
}

/** Result of stripping the trailing `SOURCES: [..]` citation line from a model reply. */
export interface ParsedCitations {
  /** Zero-based CONTEXT indices the model cited. null when no SOURCES line was found. */
  cited: Set<number> | null
  /** Answer text with the trailing SOURCES line removed. */
  text: string
}

// Matches the trailing citation line (last thing in the reply), tolerating leading
// whitespace and a missing newline. Capture group holds the comma-separated numbers.
const SOURCES_LINE = /\s*SOURCES:\s*\[([^\]]*)\]\s*$/

/**
 * Parse + strip the model's trailing `SOURCES: [..]` line. Pure (no imports beyond
 * types) so it is independently runnable — see citations.check.ts.
 * A well-formed `SOURCES: []` yields an empty set (cited nothing); a missing line
 * yields `null` so callers can fall back rather than silently drop real sources.
 */
export function parseCitations(raw: string): ParsedCitations {
  const m = raw.match(SOURCES_LINE)
  if (!m) return { cited: null, text: raw.trim() }
  const cited = new Set<number>()
  for (const part of m[1].split(',')) {
    const n = Number(part.trim())
    if (Number.isInteger(n) && n >= 1) cited.add(n - 1)
  }
  return { cited, text: raw.slice(0, m.index).trim() }
}

export const BRIEFING_SYSTEM_PROMPT = `You are Nerd, prepping a Headout employee for an upcoming call.
Using ONLY the retrieved CONTEXT from Headout's internal knowledge base plus the rep's
meeting description, produce a tight pre-call briefing.

Return STRICT JSON with this shape:
{
  "briefing": "<=200 word summary of what matters for this meeting",
  "anticipatedQuestions": [
    { "question": "...", "answer": "exact, defensible answer", "source": "doc title or channel" }
  ]
}
Include exactly 3 anticipated questions. Prefer exact numbers/SLAs/pricing from CONTEXT.
If CONTEXT lacks a fact, say so in the answer rather than inventing it.`
