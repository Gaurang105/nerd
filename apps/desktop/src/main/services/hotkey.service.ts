import { globalShortcut } from 'electron'
import { IPC } from '@nerd/shared'
import type { BrowserWindow } from 'electron'
import type { OutputFormat } from '@nerd/shared'
import type { RAGService } from './rag.service'
import type { TranscriptionService } from './transcription.service'
import type { ScreenContextService } from './screen.service'
import type { ModeService } from './mode.service'

// Fix 41 note: Cmd+Enter also sends in Slack. Document trade-off or use Cmd+Shift+Enter.
const HOTKEY = 'CommandOrControl+Return'
const OCR_TIMEOUT_MS = 800

export class HotkeyService {
  private currentAbortController: AbortController | null = null
  private currentRequestId = 0

  constructor(
    private readonly win: BrowserWindow,
    private readonly ragService: RAGService,
    private readonly transcription: TranscriptionService,
    private readonly screen: ScreenContextService,
    private readonly modeService: ModeService,
    private readonly getOutputFormat: () => OutputFormat
  ) {}

  register(): void {
    globalShortcut.register(HOTKEY, () => void this.onHotkey())
  }

  unregister(): void {
    globalShortcut.unregister(HOTKEY)
  }

  private async onHotkey(): Promise<void> {
    // Fix 2: send done:true for previous in-flight request so renderer clears "thinking" state
    if (this.currentAbortController && this.currentRequestId > 0) {
      const prevId = String(this.currentRequestId)
      this.win.webContents.send(IPC.ON_ANSWER, {
        requestId: prevId,
        token: '',
        done: true,
        citations: []
      })
    }
    this.currentAbortController?.abort()
    const ac = new AbortController()
    this.currentAbortController = ac
    const requestId = String(++this.currentRequestId)

    const transcriptContext = this.transcription.getRecentText(30)
    const systemPrompt = this.modeService.getActiveSystemPrompt()
    const outputFormat = this.getOutputFormat()

    // Fix 3: cap OCR at 800ms so it cannot block the pipeline — degrade to '' on timeout
    const ocrPromise = Promise.race<string>([
      this.screen.captureAndOcr().catch(() => ''),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), OCR_TIMEOUT_MS))
    ])

    // Screen OCR + query rewrite run in parallel
    const [screenText, cleanQuestion] = await Promise.all([
      ocrPromise,
      this.ragService
        .rewriteQuery(
          transcriptContext || '(no transcript — user triggered hotkey manually)',
          AbortSignal.any([ac.signal, AbortSignal.timeout(250)])
        )
        .catch(() => transcriptContext)
    ])

    if (ac.signal.aborted) return

    let vector: number[] = []
    try {
      vector = await this.ragService.embedQuery(
        cleanQuestion,
        AbortSignal.any([ac.signal, AbortSignal.timeout(300)])
      )
    } catch {
      if (!ac.signal.aborted) {
        this.win.webContents.send(IPC.ON_ANSWER, {
          requestId,
          token: '(embedding unavailable)',
          done: true,
          citations: []
        })
      }
      return
    }

    if (ac.signal.aborted) return

    let chunks: Awaited<ReturnType<RAGService['retrieveChunks']>> = []
    try {
      chunks = await this.ragService.retrieveChunks(
        vector,
        cleanQuestion,
        AbortSignal.any([ac.signal, AbortSignal.timeout(500)])
      )
    } catch {
      /* use empty */
    }

    if (ac.signal.aborted) return

    let reranked = chunks
    try {
      reranked = await this.ragService.rerankChunks(
        chunks,
        cleanQuestion,
        AbortSignal.any([ac.signal, AbortSignal.timeout(400)])
      )
    } catch {
      reranked = chunks.slice(0, 5)
    }

    if (ac.signal.aborted) return

    for await (const token of this.ragService.generateAnswer(
      {
        question: cleanQuestion,
        chunks: reranked,
        screenText,
        transcriptContext,
        outputFormat,
        systemPrompt,
        requestId
      },
      AbortSignal.any([ac.signal, AbortSignal.timeout(8000)])
    )) {
      if (ac.signal.aborted) break
      this.win.webContents.send(IPC.ON_ANSWER, token)
    }
  }
}
