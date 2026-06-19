import { useEffect, useRef, useState } from 'react'

// ScriptProcessorNode is deprecated in favour of AudioWorkletNode.
// Upgrade to AudioWorkletNode in a follow-up pass.

interface CaptureRefs {
  micStream: MediaStream | null
  systemStream: MediaStream | null
  micProcessor: ScriptProcessorNode | null
  systemProcessor: ScriptProcessorNode | null
  ctx: AudioContext | null
  muted: GainNode | null
}

function floatToInt16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    // Use 0x7FFF (32767) so range is symmetric around 0
    int16[i] = Math.max(-32768, Math.min(32767, float32[i]! * 32767))
  }
  return int16.buffer
}

export function AudioToggle(): React.JSX.Element {
  const [active, setActive] = useState(false)
  const captureRef = useRef<CaptureRefs>({
    micStream: null,
    systemStream: null,
    micProcessor: null,
    systemProcessor: null,
    ctx: null,
    muted: null
  })

  useEffect(() => {
    const startUnsub = window.nerd.onStartAudioCapture(async () => {
      try {
        // AudioContext sampleRate: Chromium may ignore 16000 on macOS if hardware is 48000.
        // Read ctx.sampleRate after construction — Deepgram is told the actual rate via env.
        const ctx = new AudioContext({ sampleRate: 16000 })
        captureRef.current.ctx = ctx

        // Fix 4: route processors through a muted gain node to avoid audio feedback
        const muted = ctx.createGain()
        muted.gain.value = 0
        muted.connect(ctx.destination)
        captureRef.current.muted = muted

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loopback = (window as any).electronAudioLoopback
        if (loopback) {
          const systemStream: MediaStream = await loopback.getLoopbackAudioMediaStream()
          captureRef.current.systemStream = systemStream
          const systemSource = ctx.createMediaStreamSource(systemStream)
          const systemProcessor = ctx.createScriptProcessor(4096, 1, 1)
          systemProcessor.onaudioprocess = (e) => {
            const float32 = e.inputBuffer.getChannelData(0)
            window.nerd.sendAudioChunk({ data: floatToInt16(float32), source: 'system' })
          }
          systemSource.connect(systemProcessor)
          systemProcessor.connect(muted) // Fix 4: no feedback — muted, not ctx.destination
          captureRef.current.systemProcessor = systemProcessor
        }

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000 },
          video: false
        })
        captureRef.current.micStream = micStream
        const micSource = ctx.createMediaStreamSource(micStream)
        const micProcessor = ctx.createScriptProcessor(4096, 1, 1)
        micProcessor.onaudioprocess = (e) => {
          const float32 = e.inputBuffer.getChannelData(0)
          window.nerd.sendAudioChunk({ data: floatToInt16(float32), source: 'mic' })
        }
        micSource.connect(micProcessor)
        micProcessor.connect(muted) // Fix 4: no feedback
        captureRef.current.micProcessor = micProcessor
      } catch (err) {
        console.error('[AudioToggle] capture start failed:', err)
      }
    })

    const stopUnsub = window.nerd.onStopAudioCapture(() => {
      const { micStream, systemStream, micProcessor, systemProcessor, ctx } = captureRef.current
      micProcessor?.disconnect()
      systemProcessor?.disconnect()
      micStream?.getTracks().forEach((t) => t.stop())
      systemStream?.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(console.error)
      captureRef.current = {
        micStream: null,
        systemStream: null,
        micProcessor: null,
        systemProcessor: null,
        ctx: null,
        muted: null
      }
    })

    return () => {
      startUnsub()
      stopUnsub()
    }
  }, [])

  const toggle = async (): Promise<void> => {
    if (active) {
      await window.nerd.stopAudio()
    } else {
      await window.nerd.startAudio()
    }
    setActive(!active)
  }

  return (
    <button
      type="button"
      className={`panel-btn audio-toggle${active ? ' audio-toggle--active' : ''}`}
      onClick={toggle}
      title={active ? 'Stop listening' : 'Start listening'}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {active ? '⏹' : '⏺'}
    </button>
  )
}
