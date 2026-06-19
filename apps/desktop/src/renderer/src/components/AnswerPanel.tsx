import { useEffect, useRef, useState } from 'react'
import type { Citation, OutputFormat } from '@nerd/shared'

export function AnswerPanel(): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [streaming, setStreaming] = useState(false)
  const [format, setFormat] = useState<OutputFormat>('list')
  const lastRequestId = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.nerd.onAnswer((token) => {
      // Fix 5: reset answer when a new requestId starts streaming
      if (token.requestId !== lastRequestId.current) {
        lastRequestId.current = token.requestId
        setAnswer('')
        setCitations([])
      }

      if (!token.done) {
        setStreaming(true)
        // Fix 27: single string state avoids O(n²) array join on every token
        setAnswer((prev) => prev + token.token)
      } else {
        setStreaming(false)
        if (token.citations) setCitations(token.citations)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [answer])

  const toggleFormat = (): void => {
    const next: OutputFormat = format === 'list' ? 'paragraph' : 'list'
    setFormat(next)
    window.nerd.setOutputFormat(next)
    setAnswer('')
    setCitations([])
  }

  return (
    <div className="answer-panel" data-testid="answer-area">
      <div className="answer-toolbar">
        <span className="answer-label">{streaming ? '⟳ thinking…' : 'Answer'}</span>
        <button
          type="button"
          className="panel-btn answer-fmt-btn"
          onClick={toggleFormat}
          title="Toggle format"
        >
          {format === 'list' ? '¶' : '≡'}
        </button>
      </div>
      <div className="answer-body">
        {answer ? (
          <p className="answer-text">{answer}</p>
        ) : (
          <p className="answer-placeholder">⌘↩ to ask · or type below</p>
        )}
        <div ref={bottomRef} />
      </div>
      {citations.length > 0 && (
        <div className="answer-citations">
          {citations.map((c, i) => (
            <a
              key={i}
              href={c.url ?? '#'}
              className="citation-chip"
              title={c.docTitle ?? c.source}
              onClick={(e) => {
                e.preventDefault()
                // Fix 44: open in default browser, not inside the Electron renderer
                if (c.url) window.open(c.url, '_blank')
              }}
            >
              {c.docTitle ?? c.source}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
