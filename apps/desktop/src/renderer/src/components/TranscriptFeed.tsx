import { useEffect, useRef, useState } from 'react'
import type { TranscriptUtterance } from '@nerd/shared'

export function TranscriptFeed(): React.JSX.Element {
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([])
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.nerd.onTranscript((utt: TranscriptUtterance) => {
      if (!utt.isFinal) return // only show final transcripts
      setUtterances((prev) => [...prev.slice(-50), utt]) // keep last 50
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [utterances, paused])

  return (
    <div
      className="transcript-feed"
      data-testid="transcript-area"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {utterances.length === 0 ? (
        <p className="transcript-empty">Transcript will appear here during a call</p>
      ) : (
        utterances.map((utt, i) => (
          <p
            key={i}
            className={`transcript-line${utt.speaker === 'them' ? ' transcript-them' : ''}`}
          >
            {utt.text}
          </p>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  )
}
