import { app, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { IPC } from '@nerd/shared'
import type {
  AskManuallyRequest,
  GenerateBriefingRequest,
  OutputFormat,
  SnapToCornerRequest
} from '@nerd/shared'
import { createOpenAIClient, createQdrantClient, createCohereClient } from '@nerd/rag-clients'
import { WindowService } from './services/window.service'
import { RAGService } from './services/rag.service'
import { BriefingService } from './services/briefing.service'

const DEFAULT_SYSTEM_PROMPT = `You are Nerd, a real-time assistant for a Headout employee on a live call.
Answer the question implied by the conversation. Use THREE sources of truth:
1. Headout's internal knowledge base (the CONTEXT below) — authoritative for Headout-specific facts.
2. The user's live SCREEN text — authoritative for whatever is visible on screen right now.
3. Your own general knowledge — to fill gaps and handle conceptual questions.
Rules:
- Be concise. Lead with the exact number or fact.
- When a fact comes from the CONTEXT, cite the source.
- When a Headout-specific fact (number, policy, SLA, price) is NOT in CONTEXT or SCREEN, say "I don't have that data — check with ops." Never invent it.
- General/conceptual answers from your own knowledge are fine without a source.`

let windowService: WindowService

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.headout.nerd')
  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  windowService = new WindowService()
  const win = windowService.getWindow()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const openai = createOpenAIClient({ apiKey: process.env['OPENAI_API_KEY'] ?? '' })
  const qdrant = createQdrantClient({
    url: process.env['QDRANT_URL'] ?? '',
    apiKey: process.env['QDRANT_API_KEY'] ?? ''
  })
  const cohere = createCohereClient({ apiKey: process.env['COHERE_API_KEY'] ?? '' })

  const ragService = new RAGService(openai, qdrant, cohere)
  const briefingService = new BriefingService(openai, qdrant)

  let outputFormat: OutputFormat = 'list'
  let currentRequestId = 0
  let currentAbortController: AbortController | null = null

  ipcMain.handle(IPC.SNAP_TO_CORNER, (_e, { corner }: SnapToCornerRequest) =>
    windowService.snapToCorner(corner)
  )
  ipcMain.handle(IPC.LIST_MODES, () => [])
  ipcMain.handle(IPC.SET_OUTPUT_FORMAT, (_e, fmt: OutputFormat) => {
    outputFormat = fmt
  })
  ipcMain.handle(IPC.SET_ACTIVE_MODE, (_e, _req) => {
    /* stub — ModeService lands in Slice 9 */
  })
  ipcMain.handle(IPC.START_AUDIO, () => {
    /* stub */
  })
  ipcMain.handle(IPC.STOP_AUDIO, () => {
    /* stub */
  })
  ipcMain.handle(IPC.GET_COLLAPSED, () => windowService.isCollapsed())
  ipcMain.handle(IPC.SET_COLLAPSED, (_e, collapsed: boolean) =>
    windowService.setCollapsed(collapsed)
  )
  ipcMain.handle(IPC.SET_OPACITY, (_e, opacity: number) => windowService.setOpacity(opacity))

  ipcMain.handle(IPC.ASK_MANUALLY, async (_e, { question }: AskManuallyRequest) => {
    // Cancel previous in-flight request
    currentAbortController?.abort()
    const ac = new AbortController()
    currentAbortController = ac
    const requestId = String(++currentRequestId)

    const browserWin = windowService.getWindow()
    const systemPrompt = DEFAULT_SYSTEM_PROMPT

    try {
      // Stage 1: rewrite
      let cleanQuestion: string
      try {
        cleanQuestion = await ragService.rewriteQuery(
          question,
          AbortSignal.any([ac.signal, AbortSignal.timeout(250)])
        )
      } catch {
        cleanQuestion = question // fall back to raw question on timeout
      }

      if (ac.signal.aborted) return

      // Stage 2: embed
      let vector: number[]
      try {
        vector = await ragService.embedQuery(
          cleanQuestion,
          AbortSignal.any([ac.signal, AbortSignal.timeout(300)])
        )
      } catch {
        browserWin.webContents.send(IPC.ON_ANSWER, {
          requestId,
          token: '(embedding unavailable)',
          done: true,
          citations: []
        })
        return
      }

      if (ac.signal.aborted) return

      // Stage 3: retrieve
      let chunks: Awaited<ReturnType<RAGService['retrieveChunks']>> = []
      try {
        chunks = await ragService.retrieveChunks(
          vector,
          cleanQuestion,
          AbortSignal.any([ac.signal, AbortSignal.timeout(500)])
        )
      } catch {
        /* use empty chunks */
      }

      if (ac.signal.aborted) return

      // Stage 4: rerank
      let reranked = chunks
      try {
        reranked = await ragService.rerankChunks(
          chunks,
          cleanQuestion,
          AbortSignal.any([ac.signal, AbortSignal.timeout(400)])
        )
      } catch {
        reranked = chunks.slice(0, 5)
      }

      if (ac.signal.aborted) return

      // Stage 5: stream generation
      const genSignal = AbortSignal.any([ac.signal, AbortSignal.timeout(8000)])
      const genOpts = {
        question: cleanQuestion,
        chunks: reranked,
        screenText: '', // populated in Slice 8
        transcriptContext: question,
        outputFormat,
        systemPrompt,
        requestId
      }

      for await (const token of ragService.generateAnswer(genOpts, genSignal)) {
        if (ac.signal.aborted) break
        browserWin.webContents.send(IPC.ON_ANSWER, token)
      }
    } catch (err: unknown) {
      if (!ac.signal.aborted) {
        browserWin.webContents.send(IPC.ON_ANSWER, {
          requestId,
          token: `Error: ${String(err)}`,
          done: true,
          citations: []
        })
      }
    }
  })

  ipcMain.handle(
    IPC.GENERATE_BRIEFING,
    async (_e, { meetingDescription }: GenerateBriefingRequest) => {
      try {
        const briefing = await briefingService.generateBriefing(
          meetingDescription,
          DEFAULT_SYSTEM_PROMPT
        )
        windowService.getWindow().webContents.send(IPC.ON_BRIEFING_READY, briefing)
      } catch (err) {
        console.error('[briefing] failed:', err)
      }
    }
  )
})

app.on('window-all-closed', () => app.quit())
