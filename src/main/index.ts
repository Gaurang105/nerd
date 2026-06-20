import { app, BrowserWindow, globalShortcut } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initMain as initAudioLoopback } from 'electron-audio-loopback'
import { WindowService } from './services/WindowService'
import { registerIpc } from './ipc/handlers'
import { AnswerCoordinator } from './services/AnswerCoordinator'
import { TranscriptionService } from './audio/TranscriptionService'
import { HotkeyService } from './hotkey/HotkeyService'
import { transcripts } from './audio/transcriptBuffer'
import { CH } from './ipc/channels'
import { getSchema } from './services/sqlTool'

// Must run before app is ready (registers loopback feature flags + IPC handlers).
initAudioLoopback()

let windows: WindowService | null = null

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.headout.nerd')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  windows = new WindowService()
  windows.registerShortcuts()

  const send = (channel: string, payload: unknown): void => {
    const win = (windows as WindowService).win
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  const transcription = new TranscriptionService(() =>
    send(CH.transcriptUpdate, transcripts.liveTurns())
  )
  const coordinator = new AnswerCoordinator(send)
  new HotkeyService(coordinator).register()

  registerIpc({ getWindows: () => windows as WindowService, coordinator, transcription })

  // Warm the DB schema cache so the first question doesn't pay introspection latency.
  void getSchema().catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows = new WindowService()
      windows.registerShortcuts()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Overlay is a single always-on-top window; quit when it closes (incl. macOS).
app.on('window-all-closed', () => {
  app.quit()
})
