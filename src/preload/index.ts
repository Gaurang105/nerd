import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Appearance,
  BriefingResult,
  Corner,
  FinalAnswer,
  Mode,
  NerdAPI,
  OutputFormat,
  PartialAnswer,
  Settings,
  ShortcutAction,
  StatusEvent,
  SyncStatus,
  TranscriptTurn
} from '@shared/types'
import { CH } from '../main/ipc/channels'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const nerd: NerdAPI = {
  runBriefing: (description) => ipcRenderer.invoke(CH.briefingRun, description),
  askManually: (question, format, history) =>
    ipcRenderer.invoke(CH.answerAsk, question, format, history),
  setOutputFormat: (format: OutputFormat) => ipcRenderer.invoke(CH.setFormat, format),
  onPartialAnswer: (cb) => subscribe<PartialAnswer>(CH.answerPartial, cb),
  onAnswerStatus: (cb) => subscribe<StatusEvent>(CH.answerStatus, cb),
  onAnswer: (cb) => subscribe<FinalAnswer>(CH.answerFinal, cb),
  onBriefingReady: (cb) => subscribe<BriefingResult>(CH.briefingReady, cb),
  snapToCorner: (corner: Corner) => ipcRenderer.invoke(CH.windowSnap, corner),
  setCollapsed: (collapsed) => ipcRenderer.invoke(CH.windowCollapse, collapsed),
  setHidden: (hidden) => ipcRenderer.invoke(CH.windowHidden, hidden),
  setContentSize: (width, height) => ipcRenderer.invoke(CH.windowContentSize, width, height),
  onCollapsedChanged: (cb) => subscribe<boolean>(CH.windowCollapsedChanged, cb),
  onShortcut: (cb) => subscribe<ShortcutAction>(CH.shortcut, cb),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(CH.settingsGet),
  setAppearance: (appearance: Appearance) => ipcRenderer.invoke(CH.settingsAppearance, appearance),
  setShortcut: (id, key) => ipcRenderer.invoke(CH.shortcutSet, id, key),
  getSyncStatus: (): Promise<SyncStatus> => ipcRenderer.invoke(CH.syncStatus),
  startCapture: () => ipcRenderer.invoke(CH.audioStart),
  stopCapture: () => ipcRenderer.invoke(CH.audioStop),
  onTranscript: (cb) => subscribe<TranscriptTurn[]>(CH.transcriptUpdate, cb),
  listModes: (): Promise<Mode[]> => ipcRenderer.invoke(CH.modesList),
  createMode: (name: string, systemPrompt: string) =>
    ipcRenderer.invoke(CH.modeCreate, name, systemPrompt),
  updateMode: (mode: Mode) => ipcRenderer.invoke(CH.modeUpdate, mode),
  deleteMode: (id: string) => ipcRenderer.invoke(CH.modeDelete, id),
  setActiveMode: (id: string) => ipcRenderer.invoke(CH.modeSetActive, id)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('nerd', nerd)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.nerd = nerd
}
