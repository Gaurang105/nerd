import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import type { TranscriptUtterance } from '@nerd/shared'
import { EventEmitter } from 'events'

const BUFFER_DURATION_MS = 60_000

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

type DeepgramClient = ReturnType<typeof createClient>
type LiveConnection = ReturnType<DeepgramClient['listen']['live']>

interface DeepgramTranscriptData {
  channel?: { alternatives?: Array<{ transcript?: string }> }
  is_final?: boolean
}

export class TranscriptionService extends EventEmitter {
  private deepgram: DeepgramClient
  private micConnection: LiveConnection | null = null
  private systemConnection: LiveConnection | null = null
  private buffer: TranscriptUtterance[] = []

  constructor(apiKey: string) {
    super()
    this.deepgram = createClient(apiKey)
  }

  start(): void {
    const opts = {
      model: 'nova-3',
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1
    }

    this.micConnection = this.deepgram.listen.live(opts)
    this.systemConnection = this.deepgram.listen.live(opts)

    this.micConnection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramTranscriptData) => {
      const text = data.channel?.alternatives?.[0]?.transcript ?? ''
      if (!text) return
      const utt: TranscriptUtterance = {
        speaker: 'me',
        text,
        startMs: Date.now(),
        endMs: Date.now(),
        isFinal: data.is_final ?? false
      }
      this.addToBuffer(utt)
      this.emit('utterance', utt)
    })

    this.systemConnection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramTranscriptData) => {
      const text = data.channel?.alternatives?.[0]?.transcript ?? ''
      if (!text) return
      const utt: TranscriptUtterance = {
        speaker: 'them',
        text,
        startMs: Date.now(),
        endMs: Date.now(),
        isFinal: data.is_final ?? false
      }
      this.addToBuffer(utt)
      this.emit('utterance', utt)
    })
  }

  sendMicAudio(chunk: Buffer): void {
    if (this.micConnection?.getReadyState() === 1) {
      this.micConnection.send(toArrayBuffer(chunk))
    }
  }

  sendSystemAudio(chunk: Buffer): void {
    if (this.systemConnection?.getReadyState() === 1) {
      this.systemConnection.send(toArrayBuffer(chunk))
    }
  }

  private addToBuffer(utt: TranscriptUtterance): void {
    this.buffer.push(utt)
    const cutoff = Date.now() - BUFFER_DURATION_MS
    this.buffer = this.buffer.filter((u) => u.startMs >= cutoff)
  }

  getLastNSeconds(n: number): TranscriptUtterance[] {
    const cutoff = Date.now() - n * 1000
    return this.buffer.filter((u) => u.startMs >= cutoff)
  }

  getRecentText(seconds = 30): string {
    return this.getLastNSeconds(seconds)
      .map((u) => `${u.speaker === 'me' ? 'Me' : 'Them'}: ${u.text}`)
      .join('\n')
  }

  stop(): void {
    this.micConnection?.finish()
    this.systemConnection?.finish()
    this.micConnection = null
    this.systemConnection = null
    this.buffer = []
  }
}
