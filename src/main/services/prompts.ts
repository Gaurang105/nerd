import type { OutputFormat, RetrievedChunk } from '@shared/types'

// The default generation system prompt (ERD). An active Mode replaces this block
// verbatim; the CONTEXT / SCREEN / TRANSCRIPT assembly is appended either way.
export const DEFAULT_SYSTEM_PROMPT = `You are Nerd, a real-time assistant for a Headout employee on a live call.

The user just asked a question. Below is the recent context, retrieved context from
Headout's internal knowledge base, and the text currently visible on the user's screen.

Answer the question. Use THREE sources of truth:
1. Headout's internal knowledge base (the CONTEXT below) — authoritative for
   Headout-specific facts: numbers, SLAs, pricing, policies, names. Always prefer it.
2. The user's live SCREEN text below — authoritative for whatever is on screen right now.
3. Your own general knowledge — to fill gaps, explain concepts, or answer anything the
   CONTEXT and SCREEN do not cover.

Rules:
- Be concise. Lead with the exact number or fact.
- When a fact comes from the CONTEXT, cite the source.
- When a Headout-specific fact (a number, policy, SLA, price) is NOT in the CONTEXT or
  SCREEN, do NOT invent it — say "I don't have that data — check with ops."
- General/conceptual answers from your own knowledge are fine without a source, but make
  clear they are general guidance, not Headout's confirmed data.`

export function formatInstruction(format: OutputFormat): string {
  return format === 'list'
    ? 'Answer as terse bullets — just the number/hook.'
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
}

export function buildUserPrompt({
  question,
  chunks,
  format,
  screenText = '(none)',
  transcript = '(none)',
  answerMemory = '(none)'
}: UserPromptParts): string {
  return `${formatInstruction(format)}

CONTEXT:
${contextBlock(chunks)}

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
