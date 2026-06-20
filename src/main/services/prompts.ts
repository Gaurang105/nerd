import type { OutputFormat, RetrievedChunk } from '@shared/types'

// The default generation system prompt (ERD). An active Mode replaces this block
// verbatim; the CONTEXT / SCREEN / TRANSCRIPT assembly is appended either way.
export const DEFAULT_SYSTEM_PROMPT = `You are Nerd, a real-time assistant for a Headout employee on a live call.

The user just asked a question. Below is the recent context, retrieved context from
Headout's internal knowledge base, and the text currently visible on the user's screen.

Answer the question. Use FOUR sources of truth:
1. The DATABASE (via the query_database tool) — authoritative for structured/operational
   data: counts, lists, filters, date ranges. Prefer it for any "how many / which / list" question.
2. Headout's internal knowledge base (the CONTEXT below) — authoritative for
   Headout-specific facts: numbers, SLAs, pricing, policies, names.
3. The user's live SCREEN text below — authoritative for whatever is on screen right now.
4. Your own general knowledge — to fill gaps, explain concepts, or answer anything the
   others do not cover.

Rules:
- Be concise. Lead with the exact number or fact.
- Attribute every fact to its source: DB query, CONTEXT (cite it), SCREEN, or say plainly
  it is general knowledge. Never blend a real Headout number with an invented one.
- When a Headout-specific fact (a number, policy, SLA, price) is NOT in the DATABASE,
  CONTEXT, or SCREEN, do NOT invent it — say "I don't have that data — check with ops."
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
    .map((c, i) => `[${i + 1}] (${c.source} — ${c.docTitle || 'untitled'})\n${c.text}`)
    .join('\n\n')
}

export interface UserPromptParts {
  question: string
  chunks: RetrievedChunk[]
  format: OutputFormat
  screenText?: string
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
  screenText = '(none)',
  transcript = '(none)',
  answerMemory = '(none)',
  schema = ''
}: UserPromptParts): string {
  return `${formatInstruction(format)}

CONTEXT:
${contextBlock(chunks)}

DATABASE (use the query_database tool for structured questions — filters, counts, aggregations, date ranges; prefer it over CONTEXT for those. The app renders the returned rows as a table for the user, so do NOT list or re-type the rows yourself — give only a brief summary, e.g. the count or a notable insight. Tables:):
${schema || '(unavailable)'}

SCREEN (live, on user's display right now):
${screenText || '(none)'}

RECENT TRANSCRIPT:
${transcript || '(none)'}

RECENT ANSWERS (do not repeat these):
${answerMemory || '(none)'}

QUESTION:
${question}`
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
