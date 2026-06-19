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

export interface NerdApi {
  snapToCorner: (corner: Corner) => Promise<void>
  listModes: () => Promise<Mode[]>
  setActiveMode: (modeId: string) => Promise<void>
  setOutputFormat: (fmt: OutputFormat) => Promise<void>
  askManually: (req: AskManuallyRequest) => Promise<void>
  generateBriefing: (req: GenerateBriefingRequest) => Promise<void>
  startAudio: () => Promise<void>
  stopAudio: () => Promise<void>
  setCollapsed: (collapsed: boolean) => Promise<void>
  getCollapsed: () => Promise<boolean>
  setOpacity: (opacity: number) => Promise<void>
  onAnswer: (cb: (token: AnswerToken) => void) => () => void
  onTranscript: (cb: (utt: TranscriptUtterance) => void) => () => void
  onBriefingReady: (cb: (brief: BriefingResponse) => void) => () => void
}

declare global {
  interface Window {
    nerd: NerdApi
  }
}
