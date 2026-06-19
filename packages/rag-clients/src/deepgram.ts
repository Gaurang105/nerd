export interface DeepgramClientConfig {
  apiKey: string
}

export type DeepgramClient = unknown

export function createDeepgramClient(_cfg: DeepgramClientConfig): DeepgramClient {
  throw new Error('deepgram client not yet implemented — lands in slice 6')
}
