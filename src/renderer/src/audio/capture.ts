import type { TranscriptRole } from '@shared/types'

// Served from public/ as a same-origin asset; resolved relative to the document
// (index.html) so it loads in both dev and the packaged file:// build under CSP.
const WORKLET_URL = 'pcm-worklet.js'

// Renderer-side audio capture: mic + system loopback -> 16kHz PCM frames -> IPC.
// The heavy lifting (downsample) happens in the AudioWorklet; only PCM crosses IPC.

let ctx: AudioContext | null = null
let streams: MediaStream[] = []
let nodes: AudioWorkletNode[] = []

const ipc = (): typeof window.electron.ipcRenderer => window.electron.ipcRenderer

function wire(stream: MediaStream, role: TranscriptRole): void {
  if (!ctx) return
  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-worklet')
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => ipc().send('audio:frame', role, e.data)
  src.connect(node)
  // Intentionally NOT connected to destination — we don't want to hear it back.
  nodes.push(node)
  streams.push(stream)
}

async function systemStream(): Promise<MediaStream> {
  // electron-audio-loopback registers these handlers; enable, grab, then restore.
  await ipc().invoke('enable-loopback-audio')
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  stream.getVideoTracks().forEach((t) => {
    t.stop()
    stream.removeTrack(t)
  })
  await ipc().invoke('disable-loopback-audio')
  return stream
}

export async function startCapture(): Promise<void> {
  if (ctx) return
  ctx = new AudioContext()
  await ctx.audioWorklet.addModule(WORKLET_URL)
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  wire(mic, 'me')
  try {
    wire(await systemStream(), 'them')
  } catch (err) {
    // Degrade to mic-only if loopback/screen permission is denied.
    console.error('[capture] system audio unavailable, mic-only', err)
  }
}

export function stopCapture(): void {
  nodes.forEach((n) => n.disconnect())
  streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
  nodes = []
  streams = []
  void ctx?.close()
  ctx = null
}
