import { globalShortcut } from 'electron'
import { IPC } from '@nerd/shared'
import type { BrowserWindow } from 'electron'
import type { OutputFormat } from '@nerd/shared'
import type { RAGService } from './rag.service'
import type { TranscriptionService } from './transcription.service'
import type { ScreenContextService } from './screen.service'
import type { ModeService } from './mode.service'

const HOTKEY = 'CommandOrControl+Return'

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
    // Cancel any in-flight request
    this.currentAbortController?.abort()
    const ac = new AbortController()
    this.currentAbortController = ac
    const requestId = String(++this.currentRequestId)

    const transcriptContext = this.transcription.getRecentText(30)
    const systemPrompt = this.modeService.getActiveSystemPrompt()
    const outputFormat = this.getOutputFormat()

    // Screen OCR + query rewrite run in parallel
    const [screenText, cleanQuestion] = await Promise.all([
      this.screen.captureAndOcr().catch(() => ''),
      this.ragService
        .rewriteQuery(
          transcriptContext || '(no transcript — user triggered hotkey manually)',
          AbortSignal.any([ac.signal, AbortSignal.timeout(250)])
        )
        .catch(() => transcriptContext)
    ])

    if (ac.signal.aborted) return

    // Embed
    let vector: number[] = []
    try {
      vector = await this.ragService.embedQuery(
        cleanQuestion,
        AbortSignal.any([ac.signal, AbortSignal.timeout(300)])
      )
    } catch {
      this.win.webContents.send(IPC.ON_ANSWER, {
        requestId,
        token: '(embedding unavailable)',
        done: true,
        citations: []
      })
      return
    }

    if (ac.signal.aborted) return

    // Retrieve
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

    // Rerank
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

    // Stream generation
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
