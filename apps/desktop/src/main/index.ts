import { app, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { IPC } from '@nerd/shared'
import type {
  AskManuallyRequest,
  CreateModeRequest,
  DeleteModeRequest,
  GenerateBriefingRequest,
  OutputFormat,
  SetActiveModeRequest,
  SnapToCornerRequest,
  UpdateModeRequest
} from '@nerd/shared'
import {
  createOpenAIClient,
  createQdrantClient,
  createCohereClient,
  createSupabaseClient
} from '@nerd/rag-clients'
import { WindowService } from './services/window.service'
import { ModeService } from './services/mode.service'
import { RAGService } from './services/rag.service'
import { BriefingService } from './services/briefing.service'
import { TranscriptionService } from './services/transcription.service'
import { ScreenContextService } from './services/screen.service'
import { HotkeyService } from './services/hotkey.service'

let windowService: WindowService
let modeService: ModeService

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.headout.nerd')
  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loopback = require('electron-audio-loopback')
    loopback.initMain(app)
  } catch {
    console.warn('[audio-loopback] electron-audio-loopback not available — audio capture disabled')
  }

  windowService = new WindowService()
  modeService = new ModeService()
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

  const supabase = createSupabaseClient({
    url: process.env['SUPABASE_URL'] ?? '',
    key: process.env['SUPABASE_ANON_KEY'] ?? ''
  })

  const transcriptionService = new TranscriptionService(process.env['DEEPGRAM_API_KEY'] ?? '')
  const screenService = new ScreenContextService()

  // Init Tesseract in background (non-blocking)
  screenService.init().catch(console.error)

  let outputFormat: OutputFormat = 'list'
  let currentRequestId = 0
  let currentAbortController: AbortController | null = null

  const hotkeyService = new HotkeyService(
    win,
    ragService,
    transcriptionService,
    screenService,
    modeService,
    () => outputFormat
  )
  hotkeyService.register()

  // Window
  ipcMain.handle(IPC.SNAP_TO_CORNER, (_e, { corner }: SnapToCornerRequest) =>
    windowService.snapToCorner(corner)
  )
  ipcMain.handle(IPC.GET_COLLAPSED, () => windowService.isCollapsed())
  ipcMain.handle(IPC.SET_COLLAPSED, (_e, collapsed: boolean) =>
    windowService.setCollapsed(collapsed)
  )
  ipcMain.handle(IPC.SET_OPACITY, (_e, opacity: number) => windowService.setOpacity(opacity))

  // Modes
  ipcMain.handle(IPC.LIST_MODES, () => modeService.listModes())
  ipcMain.handle(IPC.GET_ACTIVE_MODE, () => modeService.getActiveMode())
  ipcMain.handle(IPC.SET_ACTIVE_MODE, (_e, { modeId }: SetActiveModeRequest) =>
    modeService.setActiveMode(modeId)
  )
  ipcMain.handle(IPC.CREATE_MODE, (_e, { name, systemPrompt }: CreateModeRequest) =>
    modeService.createMode(name, systemPrompt)
  )
  ipcMain.handle(IPC.UPDATE_MODE, (_e, { id, updates }: UpdateModeRequest) =>
    modeService.updateMode(id, updates)
  )
  ipcMain.handle(IPC.DELETE_MODE, (_e, { id }: DeleteModeRequest) => modeService.deleteMode(id))

  // Output format
  ipcMain.handle(IPC.SET_OUTPUT_FORMAT, (_e, fmt: OutputFormat) => {
    outputFormat = fmt
  })

  // Audio capture + Deepgram transcription
  // Audio is captured renderer-side via electron-audio-loopback and forwarded over IPC.
  ipcMain.handle(IPC.START_AUDIO, async () => {
    transcriptionService.start()
    win.webContents.send(IPC.START_AUDIO_CAPTURE)
  })

  ipcMain.handle(IPC.STOP_AUDIO, () => {
    transcriptionService.stop()
    win.webContents.send(IPC.STOP_AUDIO_CAPTURE)
  })

  ipcMain.on(IPC.SEND_AUDIO_CHUNK, (_e, chunk: { data: ArrayBuffer; source: 'mic' | 'system' }) => {
    const buf = Buffer.from(chunk.data)
    if (chunk.source === 'mic') {
      transcriptionService.sendMicAudio(buf)
    } else {
      transcriptionService.sendSystemAudio(buf)
    }
  })

  // Forward transcript utterances to renderer
  transcriptionService.on('utterance', (utt) => {
    win.webContents.send(IPC.ON_TRANSCRIPT, utt)
  })

  // RAG — ask manually
  ipcMain.handle(IPC.ASK_MANUALLY, async (_e, { question }: AskManuallyRequest) => {
    currentAbortController?.abort()
    const ac = new AbortController()
    currentAbortController = ac
    const requestId = String(++currentRequestId)

    const browserWin = windowService.getWindow()
    const systemPrompt = modeService.getActiveSystemPrompt()

    try {
      let cleanQuestion: string
      try {
        cleanQuestion = await ragService.rewriteQuery(
          question,
          AbortSignal.any([ac.signal, AbortSignal.timeout(250)])
        )
      } catch {
        cleanQuestion = question
      }

      if (ac.signal.aborted) return

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

      for await (const token of ragService.generateAnswer(
        {
          question: cleanQuestion,
          chunks: reranked,
          screenText: '', // populated in Slice 8
          transcriptContext: question,
          outputFormat,
          systemPrompt,
          requestId
        },
        AbortSignal.any([ac.signal, AbortSignal.timeout(8000)])
      )) {
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

  // Briefing
  ipcMain.handle(
    IPC.GENERATE_BRIEFING,
    async (_e, { meetingDescription }: GenerateBriefingRequest) => {
      try {
        const briefing = await briefingService.generateBriefing(
          meetingDescription,
          modeService.getActiveSystemPrompt()
        )
        windowService.getWindow().webContents.send(IPC.ON_BRIEFING_READY, briefing)
      } catch (err) {
        console.error('[briefing] failed:', err)
      }
    }
  )

  // Last-synced badge
  ipcMain.handle(IPC.GET_LAST_SYNC_INFO, async () => {
    try {
      const { data } = await supabase
        .from('sync_runs')
        .select('source, finished_at, docs_new, docs_updated')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1)
      const row = data?.[0]
      if (!row?.finished_at) return null
      const ageMs = Date.now() - row.finished_at
      const ageHours = Math.floor(ageMs / 3600000)
      const ageMinutes = Math.floor(ageMs / 60000)
      return {
        age: ageHours >= 1 ? `${ageHours}h ago` : `${ageMinutes}m ago`,
        source: row.source as string
      }
    } catch {
      return null
    }
  })

  app.on('will-quit', () => {
    hotkeyService.unregister()
    transcriptionService.stop()
    screenService.destroy().catch(console.error)
  })
})

app.on('window-all-closed', () => app.quit())
