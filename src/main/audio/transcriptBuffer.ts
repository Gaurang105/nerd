import type { TranscriptRole, TranscriptTurn } from '@shared/types'

// Pure rolling transcript buffer — no electron/network imports, so it is independently
// runnable (see transcriptBuffer.check.ts). Holds the hot context the hotkey slices.

const WINDOW_MS = 120_000 // last 120s
const MAX_TURNS = 12 // capped at 12 turns
const MAX_ANSWERS = 3 // last 3 assistant answers
const ANSWER_TRUNC = 200 // ~200 chars each

export class TranscriptBuffer {
  private turns: TranscriptTurn[] = []
  private interim: Partial<Record<TranscriptRole, string>> = {}
  private answers: string[] = []

  /** Commit a finalized turn. */
  addFinal(role: TranscriptRole, text: string, ts: number = Date.now()): void {
    const clean = text.trim()
    this.interim[role] = ''
    if (!clean) return
    this.turns.push({ role, text: clean, ts })
    this.prune(ts)
  }

  /** Replace the in-progress (interim) text for a role. */
  setInterim(role: TranscriptRole, text: string): void {
    this.interim[role] = text.trim()
  }

  /** Record an assistant answer (truncated) so the model can avoid repeating itself. */
  addAnswer(text: string): void {
    const clean = text.trim()
    if (!clean) return
    this.answers.push(clean.slice(0, ANSWER_TRUNC))
    if (this.answers.length > MAX_ANSWERS) this.answers = this.answers.slice(-MAX_ANSWERS)
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS
    this.turns = this.turns.filter((t) => t.ts >= cutoff)
    if (this.turns.length > MAX_TURNS) this.turns = this.turns.slice(-MAX_TURNS)
  }

  /** All live turns (after eviction) plus any in-progress interim, for the UI feed. */
  liveTurns(now: number = Date.now()): TranscriptTurn[] {
    this.prune(now)
    const out = [...this.turns]
    for (const role of ['me', 'them'] as TranscriptRole[]) {
      const partial = this.interim[role]
      if (partial) out.push({ role, text: partial, ts: now, interim: true })
    }
    return out
  }

  /** RECENT TRANSCRIPT block for the generation prompt. */
  recentText(now: number = Date.now()): string {
    const lines = this.liveTurns(now).map((t) => `${t.role === 'me' ? 'Me' : 'Them'}: ${t.text}`)
    return lines.length ? lines.join('\n') : '(no speech captured yet)'
  }

  /** RECENT ANSWERS block (last 3) for the generation prompt. */
  recentAnswers(): string {
    return this.answers.length ? this.answers.map((a, i) => `${i + 1}. ${a}`).join('\n') : '(none)'
  }

  clear(): void {
    this.turns = []
    this.interim = {}
    this.answers = []
  }
}

// App-global singleton: one live buffer shared by transcription, hotkey, and IPC.
export const transcripts = new TranscriptBuffer()
