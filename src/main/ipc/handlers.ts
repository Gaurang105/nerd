import { ipcMain } from 'electron'
import type {
  Appearance,
  Corner,
  Mode,
  OutputFormat,
  Settings,
  ShortcutId,
  SyncStatus,
  TranscriptRole
} from '@shared/types'
import { CH } from './channels'
import type { WindowService } from '../services/WindowService'
import type { AnswerCoordinator } from '../services/AnswerCoordinator'
import type { TranscriptionService } from '../audio/TranscriptionService'
import { runBriefing } from '../services/BriefingService'
import { loadSettings, saveSettings } from '../config/store'
import { getLastSync } from '../services/db'
import { timeAgo } from '../util/timeAgo'
import { listModes, createMode, updateMode, deleteMode, setActiveMode } from '../mode/ModeService'

interface Deps {
  getWindows: () => WindowService
  coordinator: AnswerCoordinator
  transcription: TranscriptionService
}

export function registerIpc({ getWindows, coordinator, transcription }: Deps): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindows().win
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }

  // ---- Answers (manual + shared coordinator) ----
  ipcMain.handle(CH.answerAsk, (_e, question: string, format: OutputFormat): number =>
    coordinator.run({ question, format, rewrite: false })
  )
  ipcMain.handle(CH.setFormat, (_e, format: OutputFormat) => saveSettings({ format }))

  // ---- Briefing ----
  ipcMain.handle(CH.briefingRun, async (_e, description: string): Promise<void> => {
    send(CH.briefingReady, await runBriefing(description))
  })

  // ---- Audio + transcription ----
  ipcMain.handle(CH.audioStart, () => transcription.start())
  ipcMain.handle(CH.audioStop, () => transcription.stop())
  ipcMain.on(CH.audioFrame, (_e, role: TranscriptRole, data: ArrayBuffer | ArrayBufferView) => {
    transcription.pushFrame(role, ArrayBuffer.isView(data) ? data : new Uint8Array(data))
  })

  // ---- Window ----
  ipcMain.handle(CH.windowSnap, (_e, corner: Corner) => getWindows().snapToCorner(corner))
  ipcMain.handle(CH.windowCollapse, (_e, collapsed: boolean) =>
    getWindows().setCollapsed(collapsed)
  )
  ipcMain.handle(CH.windowHidden, (_e, hidden: boolean) => getWindows().setHidden(hidden))
  ipcMain.handle(CH.windowContentSize, (_e, width: number | null, height: number) =>
    getWindows().setContentSize(width, height)
  )

  // ---- Settings ----
  ipcMain.handle(CH.settingsGet, (): Settings => loadSettings())
  ipcMain.handle(CH.settingsAppearance, (_e, appearance: Appearance) =>
    saveSettings({ appearance })
  )
  ipcMain.handle(CH.shortcutSet, (_e, id: ShortcutId, key: string) =>
    getWindows().updateShortcut(id, key)
  )
  ipcMain.handle(CH.syncStatus, async (): Promise<SyncStatus> => {
    const lastSyncedAt = await getLastSync()
    return { lastSyncedAt, ageLabel: timeAgo(lastSyncedAt) }
  })

  // ---- Modes ----
  ipcMain.handle(CH.modesList, (): Mode[] => listModes())
  ipcMain.handle(CH.modeCreate, (_e, name: string, systemPrompt: string): Mode[] =>
    createMode(name, systemPrompt)
  )
  ipcMain.handle(CH.modeUpdate, (_e, mode: Mode): Mode[] => updateMode(mode))
  ipcMain.handle(CH.modeDelete, (_e, id: string): Mode[] => deleteMode(id))
  ipcMain.handle(CH.modeSetActive, (_e, id: string): Mode[] => setActiveMode(id))
}
