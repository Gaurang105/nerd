import { globalShortcut } from 'electron'
import { transcripts } from '../audio/transcriptBuffer'
import { captureScreenText } from '../screen/ScreenContextService'
import { loadSettings } from '../config/store'
import type { AnswerCoordinator } from '../services/AnswerCoordinator'

/**
 * Cmd+Enter: slice the hot transcript + last answers, kick screen OCR in parallel,
 * and run the RAG pipeline (rewrite on, since the transcript slice is noisy).
 */
export class HotkeyService {
  constructor(private readonly coordinator: AnswerCoordinator) {}

  register(): void {
    globalShortcut.register('CommandOrControl+Enter', () => this.trigger())
  }

  private trigger(): void {
    const transcript = transcripts.recentText()
    this.coordinator.run({
      question: transcript,
      format: loadSettings().format,
      rewrite: true,
      transcript,
      answerMemory: transcripts.recentAnswers(),
      screenText: captureScreenText() // parallel; hides under rewrite/embed
    })
  }
}
