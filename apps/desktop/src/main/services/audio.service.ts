import { EventEmitter } from 'events'

interface LoopbackStream {
  on(event: 'data', listener: (chunk: Buffer) => void): void
  removeAllListeners(): void
}

interface LoopbackModule {
  createMicStream(opts: { sampleRate: number; channels: number }): LoopbackStream
  createSystemStream(opts: { sampleRate: number; channels: number }): LoopbackStream
}

export class AudioCaptureService extends EventEmitter {
  private micStream: LoopbackStream | null = null
  private systemStream: LoopbackStream | null = null
  private running = false

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loopback = require('electron-audio-loopback') as LoopbackModule

      this.micStream = loopback.createMicStream({ sampleRate: 16000, channels: 1 })
      this.systemStream = loopback.createSystemStream({ sampleRate: 16000, channels: 1 })

      this.micStream.on('data', (chunk: Buffer) => this.emit('mic-data', chunk))
      this.systemStream.on('data', (chunk: Buffer) => this.emit('system-data', chunk))
    } catch (err) {
      console.error('[AudioCaptureService] Failed to start:', err)
      console.error(
        '[AudioCaptureService] electron-audio-loopback failed to install — run npm rebuild'
      )
      this.running = false
      throw err
    }
  }

  stop(): void {
    this.running = false
    // electron-audio-loopback streams don't have a formal destroy API — just stop emitting
    this.micStream?.removeAllListeners()
    this.systemStream?.removeAllListeners()
    this.micStream = null
    this.systemStream = null
  }

  isRunning(): boolean {
    return this.running
  }
}
