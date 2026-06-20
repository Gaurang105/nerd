import { globalShortcut } from 'electron'
import { transcripts } from '../audio/transcriptBuffer'
import { loadSettings } from '../config/store'
import type { AnswerCoordinator } from '../services/AnswerCoordinator'

/**
 * Cmd+Enter: slice the hot transcript + last answers and run the RAG pipeline
 * (rewrite on, since the transcript slice is noisy).
 */
export class HotkeyService {
  constructor(private readonly coordinator: AnswerCoordinator) {}

  register(): void {
    const ok = globalShortcut.register('CommandOrControl+Enter', () => this.trigger())
    if (!ok) console.warn('[hotkey] failed to register CommandOrControl+Enter')
  }

  private trigger(): void {
    const transcript = transcripts.recentText()
    this.coordinator.run({
      question: transcript,
      format: loadSettings().format,
      rewrite: true,
      transcript,
      answerMemory: transcripts.recentAnswers(),
      label: 'Assist' // tells the renderer to render the in-flight hotkey turn
    })
  }
}
