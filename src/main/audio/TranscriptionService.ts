import { DeepgramClient } from '@deepgram/sdk'
import type { TranscriptRole } from '@shared/types'
import { ENV } from '../config/env'
import { transcripts } from './transcriptBuffer'

type Socket = Awaited<ReturnType<DeepgramClient['listen']['v1']['connect']>>

const UPDATE_THROTTLE_MS = 120

/**
 * Two Deepgram live streams: mic ("me") and system audio ("them"). Audio frames
 * arrive from the renderer over IPC; transcripts feed the shared rolling buffer and
 * a throttled UI update. The SDK's ReconnectingWebSocket handles dropped sockets.
 */
export class TranscriptionService {
  private client = new DeepgramClient({ apiKey: ENV.deepgramApiKey })
  private sockets: Partial<Record<TranscriptRole, Socket>> = {}
  private ready: Partial<Record<TranscriptRole, boolean>> = {}
  private running = false
  private lastUpdate = 0
  private updateTimer: NodeJS.Timeout | null = null

  constructor(private readonly onUpdate: () => void) {}

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    await Promise.all([this.open('me'), this.open('them')])
  }

  private async open(role: TranscriptRole): Promise<void> {
    try {
      const socket = await this.client.listen.v1.connect({
        Authorization: `Token ${ENV.deepgramApiKey}`,
        model: ENV.transcribeModel,
        language: 'en',
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        interim_results: 'true',
        smart_format: 'true'
      })
      socket.on('message', (msg) => {
        if (msg.type !== 'Results') return
        const text = msg.channel?.alternatives?.[0]?.transcript ?? ''
        if (!text) return
        if (msg.is_final) transcripts.addFinal(role, text)
        else transcripts.setInterim(role, text)
        this.scheduleUpdate()
      })
      socket.on('open', () => {
        this.ready[role] = true
      })
      socket.on('close', () => {
        this.ready[role] = false
      })
      socket.on('error', (err) => console.error(`[transcribe:${role}]`, err))
      socket.connect()
      this.sockets[role] = socket
    } catch (err) {
      console.error(`[transcribe:${role}] failed to open`, err)
    }
  }

  pushFrame(role: TranscriptRole, data: ArrayBufferView): void {
    // Drop frames until the socket is actually open; sendMedia throws otherwise.
    // try/catch guards the open->close race so a frame can never crash the main process.
    if (!this.ready[role]) return
    try {
      this.sockets[role]?.sendMedia(data)
    } catch (err) {
      console.warn(`[transcribe:${role}] dropped frame`, (err as Error).message)
    }
  }

  stop(): void {
    this.running = false
    for (const s of Object.values(this.sockets)) {
      try {
        s?.close()
      } catch {
        /* already closed */
      }
    }
    this.sockets = {}
    this.ready = {}
    transcripts.clear()
    this.onUpdate()
  }

  // Coalesce frequent interim results into at most one UI push per throttle window.
  private scheduleUpdate(): void {
    const now = Date.now()
    if (now - this.lastUpdate >= UPDATE_THROTTLE_MS) {
      this.lastUpdate = now
      this.onUpdate()
      return
    }
    if (!this.updateTimer) {
      this.updateTimer = setTimeout(
        () => {
          this.updateTimer = null
          this.lastUpdate = Date.now()
          this.onUpdate()
        },
        UPDATE_THROTTLE_MS - (now - this.lastUpdate)
      )
    }
  }
}
