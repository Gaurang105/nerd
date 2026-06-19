import { useEffect, useRef, useState } from 'react'
import type { AnswerToken, Citation, OutputFormat } from '@nerd/shared'

export function AnswerPanel(): React.JSX.Element {
  const [tokens, setTokens] = useState<string[]>([])
  const [citations, setCitations] = useState<Citation[]>([])
  const [streaming, setStreaming] = useState(false)
  const [format, setFormat] = useState<OutputFormat>('list')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.nerd.onAnswer((token: AnswerToken) => {
      if (!token.done) {
        setStreaming(true)
        setTokens((prev) => [...prev, token.token])
      } else {
        setStreaming(false)
        if (token.citations) setCitations(token.citations)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tokens])

  const toggleFormat = (): void => {
    const next: OutputFormat = format === 'list' ? 'paragraph' : 'list'
    setFormat(next)
    window.nerd.setOutputFormat(next)
    setTokens([]) // clear on format switch
    setCitations([])
  }

  const answer = tokens.join('')

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
            <a key={i} href={c.url ?? '#'} className="citation-chip" title={c.docTitle ?? c.source}>
              {c.docTitle ?? c.source}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
