import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@nerd/shared'
import type {
  AnswerToken,
  AskManuallyRequest,
  BriefingResponse,
  Corner,
  GenerateBriefingRequest,
  LastSyncInfo,
  Mode,
  OutputFormat,
  TranscriptUtterance
} from '@nerd/shared'

const nerd = {
  snapToCorner: (corner: Corner): Promise<void> =>
    ipcRenderer.invoke(IPC.SNAP_TO_CORNER, { corner }),
  listModes: (): Promise<Mode[]> => ipcRenderer.invoke(IPC.LIST_MODES),
  getActiveMode: (): Promise<Mode> => ipcRenderer.invoke(IPC.GET_ACTIVE_MODE),
  setActiveMode: (modeId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_ACTIVE_MODE, { modeId }),
  createMode: (name: string, systemPrompt: string): Promise<Mode> =>
    ipcRenderer.invoke(IPC.CREATE_MODE, { name, systemPrompt }),
  updateMode: (
    id: string,
    updates: Partial<Pick<Mode, 'name' | 'systemPrompt' | 'isDefault'>>
  ): Promise<Mode> => ipcRenderer.invoke(IPC.UPDATE_MODE, { id, updates }),
  deleteMode: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DELETE_MODE, { id }),
  setOutputFormat: (fmt: OutputFormat): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_OUTPUT_FORMAT, fmt),
  askManually: (req: AskManuallyRequest): Promise<void> =>
    ipcRenderer.invoke(IPC.ASK_MANUALLY, req),
  generateBriefing: (req: GenerateBriefingRequest): Promise<void> =>
    ipcRenderer.invoke(IPC.GENERATE_BRIEFING, req),
  startAudio: (): Promise<void> => ipcRenderer.invoke(IPC.START_AUDIO),
  stopAudio: (): Promise<void> => ipcRenderer.invoke(IPC.STOP_AUDIO),
  onStartAudioCapture: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.START_AUDIO_CAPTURE, handler)
    return () => ipcRenderer.removeAllListeners(IPC.START_AUDIO_CAPTURE)
  },
  onStopAudioCapture: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.STOP_AUDIO_CAPTURE, handler)
    return () => ipcRenderer.removeAllListeners(IPC.STOP_AUDIO_CAPTURE)
  },
  sendAudioChunk: (chunk: { data: ArrayBuffer; source: 'mic' | 'system' }): void =>
    ipcRenderer.send(IPC.SEND_AUDIO_CHUNK, chunk),
  getLastSyncInfo: (): Promise<LastSyncInfo | null> => ipcRenderer.invoke(IPC.GET_LAST_SYNC_INFO),
  setCollapsed: (collapsed: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_COLLAPSED, collapsed),
  getCollapsed: (): Promise<boolean> => ipcRenderer.invoke(IPC.GET_COLLAPSED),
  setOpacity: (opacity: number): Promise<void> => ipcRenderer.invoke(IPC.SET_OPACITY, opacity),
  onAnswer: (cb: (token: AnswerToken) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, token: AnswerToken): void => cb(token)
    ipcRenderer.on(IPC.ON_ANSWER, handler)
    return () => ipcRenderer.removeAllListeners(IPC.ON_ANSWER)
  },
  onTranscript: (cb: (utt: TranscriptUtterance) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, utt: TranscriptUtterance): void => cb(utt)
    ipcRenderer.on(IPC.ON_TRANSCRIPT, handler)
    return () => ipcRenderer.removeAllListeners(IPC.ON_TRANSCRIPT)
  },
  onBriefingReady: (cb: (brief: BriefingResponse) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, brief: BriefingResponse): void => cb(brief)
    ipcRenderer.on(IPC.ON_BRIEFING_READY, handler)
    return () => ipcRenderer.removeAllListeners(IPC.ON_BRIEFING_READY)
  }
}

export type NerdApi = typeof nerd

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('nerd', nerd)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.nerd = nerd
}
