import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@nerd/shared'
import type {
  AnswerToken,
  AskManuallyRequest,
  BriefingResponse,
  Corner,
  GenerateBriefingRequest,
  Mode,
  OutputFormat,
  TranscriptUtterance
} from '@nerd/shared'

const nerd = {
  snapToCorner: (corner: Corner): Promise<void> =>
    ipcRenderer.invoke(IPC.SNAP_TO_CORNER, { corner }),
  listModes: (): Promise<Mode[]> => ipcRenderer.invoke(IPC.LIST_MODES),
  setActiveMode: (modeId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_ACTIVE_MODE, { modeId }),
  setOutputFormat: (fmt: OutputFormat): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_OUTPUT_FORMAT, fmt),
  askManually: (req: AskManuallyRequest): Promise<void> =>
    ipcRenderer.invoke(IPC.ASK_MANUALLY, req),
  generateBriefing: (req: GenerateBriefingRequest): Promise<void> =>
    ipcRenderer.invoke(IPC.GENERATE_BRIEFING, req),
  startAudio: (): Promise<void> => ipcRenderer.invoke(IPC.START_AUDIO),
  stopAudio: (): Promise<void> => ipcRenderer.invoke(IPC.STOP_AUDIO),
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
