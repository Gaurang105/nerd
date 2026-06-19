import type {
  AnswerToken,
  BriefingResponse,
  Mode,
  OutputFormat,
  TranscriptUtterance
} from './domain.js'

export const IPC = {
  ON_ANSWER: 'nerd:on-answer',
  ON_TRANSCRIPT: 'nerd:on-transcript',
  ON_BRIEFING_READY: 'nerd:on-briefing-ready',
  ASK_MANUALLY: 'nerd:ask-manually',
  SET_OUTPUT_FORMAT: 'nerd:set-output-format',
  LIST_MODES: 'nerd:list-modes',
  SET_ACTIVE_MODE: 'nerd:set-active-mode',
  GET_ACTIVE_MODE: 'nerd:get-active-mode',
  CREATE_MODE: 'nerd:create-mode',
  UPDATE_MODE: 'nerd:update-mode',
  DELETE_MODE: 'nerd:delete-mode',
  SNAP_TO_CORNER: 'nerd:snap-to-corner',
  GENERATE_BRIEFING: 'nerd:generate-briefing',
  START_AUDIO: 'nerd:start-audio',
  STOP_AUDIO: 'nerd:stop-audio',
  START_AUDIO_CAPTURE: 'nerd:start-audio-capture',
  STOP_AUDIO_CAPTURE: 'nerd:stop-audio-capture',
  SEND_AUDIO_CHUNK: 'nerd:send-audio-chunk',
  GET_COLLAPSED: 'nerd:get-collapsed',
  SET_COLLAPSED: 'nerd:set-collapsed',
  SET_OPACITY: 'nerd:set-opacity',
  GET_LAST_SYNC_INFO: 'nerd:get-last-sync-info',
  ON_BRIEFING_ERROR: 'nerd:on-briefing-error'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface AskManuallyRequest {
  requestId: string
  question: string
}

export interface GenerateBriefingRequest {
  meetingDescription: string
}

export interface SetActiveModeRequest {
  modeId: string
}

export interface CreateModeRequest {
  name: string
  systemPrompt: string
}

export interface UpdateModeRequest {
  id: string
  updates: Partial<Pick<Mode, 'name' | 'systemPrompt' | 'isDefault'>>
}

export interface DeleteModeRequest {
  id: string
}

export interface SnapToCornerRequest {
  corner: Corner
}

export interface AudioChunkPayload {
  data: ArrayBuffer
  source: 'mic' | 'system'
}

export interface LastSyncInfo {
  age: string
  source: string
}

export interface IpcSignatures {
  [IPC.ON_ANSWER]: { payload: AnswerToken; direction: 'main->renderer' }
  [IPC.ON_TRANSCRIPT]: { payload: TranscriptUtterance; direction: 'main->renderer' }
  [IPC.ON_BRIEFING_READY]: { payload: BriefingResponse; direction: 'main->renderer' }
  [IPC.ASK_MANUALLY]: { payload: AskManuallyRequest; direction: 'renderer->main' }
  [IPC.SET_OUTPUT_FORMAT]: { payload: OutputFormat; direction: 'renderer->main' }
  [IPC.LIST_MODES]: { payload: void; response: Mode[]; direction: 'renderer->main' }
  [IPC.SET_ACTIVE_MODE]: { payload: SetActiveModeRequest; direction: 'renderer->main' }
  [IPC.GET_ACTIVE_MODE]: { payload: void; response: Mode; direction: 'renderer->main' }
  [IPC.CREATE_MODE]: { payload: CreateModeRequest; response: Mode; direction: 'renderer->main' }
  [IPC.UPDATE_MODE]: { payload: UpdateModeRequest; response: Mode; direction: 'renderer->main' }
  [IPC.DELETE_MODE]: { payload: DeleteModeRequest; direction: 'renderer->main' }
  [IPC.SNAP_TO_CORNER]: { payload: SnapToCornerRequest; direction: 'renderer->main' }
  [IPC.GENERATE_BRIEFING]: { payload: GenerateBriefingRequest; direction: 'renderer->main' }
  [IPC.START_AUDIO]: { payload: void; direction: 'renderer->main' }
  [IPC.STOP_AUDIO]: { payload: void; direction: 'renderer->main' }
  [IPC.START_AUDIO_CAPTURE]: { payload: void; direction: 'main->renderer' }
  [IPC.STOP_AUDIO_CAPTURE]: { payload: void; direction: 'main->renderer' }
  [IPC.SEND_AUDIO_CHUNK]: { payload: AudioChunkPayload; direction: 'renderer->main' }
  [IPC.GET_COLLAPSED]: { payload: void; response: boolean; direction: 'renderer->main' }
  [IPC.SET_COLLAPSED]: { payload: boolean; direction: 'renderer->main' }
  [IPC.SET_OPACITY]: { payload: number; direction: 'renderer->main' }
  [IPC.GET_LAST_SYNC_INFO]: {
    payload: void
    response: LastSyncInfo | null
    direction: 'renderer->main'
  }
  [IPC.ON_BRIEFING_ERROR]: { payload: string; direction: 'main->renderer' }
}
