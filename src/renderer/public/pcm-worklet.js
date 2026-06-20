// AudioWorklet: downsample mic/system audio to 16 kHz mono Int16 PCM and post
// ~128ms chunks to the main thread. Runs on the audio render thread (UI stays free).
// Served as a same-origin asset (public/) so the script-src 'self' CSP allows it.
class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000 // sampleRate is the AudioWorkletGlobalScope rate
    this.acc = 0
    this.accCount = 0
    this.frac = 0
    this.pending = []
    this.flushAt = 2048 // samples (~128ms at 16kHz)
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const ch = input[0]
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]
      this.accCount++
      this.frac += 1
      if (this.frac >= this.ratio) {
        this.frac -= this.ratio
        const sample = this.acc / this.accCount
        this.acc = 0
        this.accCount = 0
        const clamped = Math.max(-1, Math.min(1, sample))
        this.pending.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
      }
    }
    if (this.pending.length >= this.flushAt) {
      const pcm = new Int16Array(this.pending)
      this.pending = []
      this.port.postMessage(pcm.buffer, [pcm.buffer])
    }
    return true
  }
}

registerProcessor('pcm-worklet', PCMWorklet)
