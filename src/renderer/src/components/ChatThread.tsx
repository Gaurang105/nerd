import { Fragment, useEffect, useRef, useState } from 'react'
import type { FinalAnswer, SqlResult, TranscriptTurn } from '@shared/types'
import { PersonIcon, ArrowUpIcon } from './icons'

export interface QATurn {
  question: string | null
  answer: string
  streaming?: boolean
  final: FinalAnswer | null
}

interface Props {
  turns: QATurn[]
  transcript: TranscriptTurn[]
  showTranscript: boolean
  /** Transient progress note for the in-flight turn (e.g. "Querying database…"). */
  status?: string
}

function cell(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Render a query_database result as a real table, straight from the DB rows. */
function SqlTable({ result }: { result: SqlResult }): React.JSX.Element {
  const { sql, columns, rows, rowCount, truncated } = result
  return (
    <div className="sql-result">
      <details className="sql-query">
        <summary>
          {truncated ? `Showing ${rows.length} of ${rowCount} rows` : `${rowCount} rows`}
        </summary>
        <pre>{sql}</pre>
      </details>
      {columns.length > 0 && (
        <div className="sql-table-wrap">
          <table className="sql-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{cell(r[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ChatThread({ turns, transcript, showTranscript, status }: Props): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, transcript, showTranscript])

  return (
    <div
      className="nerd-thread"
      ref={scrollRef}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 24)}
    >
      {showTranscript ? (
        transcript.length === 0 ? (
          <div className="thread-empty">No transcript yet</div>
        ) : (
          transcript.map((t, i) => (
            <div key={i} className={`msg transcript ${t.role} ${t.interim ? 'interim' : ''}`}>
              <PersonIcon size={16} className="msg-avatar" />
              <p>
                <span className="who">{t.role === 'me' ? 'You' : 'Them'}</span> {t.text}
              </p>
            </div>
          ))
        )
      ) : turns.length === 0 ? (
        <div className="thread-empty">No questions yet</div>
      ) : (
        turns.map((turn, i) => {
          const hasAnswer =
            turn.answer.length > 0 || turn.streaming || (turn.final && !turn.final.error)
          return (
            <Fragment key={i}>
              {turn.question && (
                <div className="msg user">
                  <span className="bubble">{turn.question}</span>
                </div>
              )}
              {turn.final?.error && turn.final.error !== 'cancelled' && (
                <div className="msg ai">
                  <PersonIcon size={16} className="msg-avatar" />
                  <p className="err">{turn.final.error}</p>
                </div>
              )}
              {hasAnswer && (
                <div className="msg ai">
                  <PersonIcon size={16} className="msg-avatar" />
                  <div className="ai-content">
                    {turn.streaming && !turn.answer && status && (
                      <p className="status">{status}</p>
                    )}
                    <p>
                      {turn.answer}
                      {turn.streaming && <span className="caret" />}
                    </p>
                    {turn.final?.data?.map((r, k) => <SqlTable key={k} result={r} />)}
                    {turn.final && !turn.final.error && turn.final.sources.length > 0 && (
                      <div className="sources">
                        Sources:{' '}
                        {turn.final.sources.map((s, j) => (
                          <span key={j}>
                            {j > 0 && ', '}
                            {s.url ? (
                              <a href={s.url} target="_blank" rel="noreferrer">
                                {s.docTitle || s.source}
                              </a>
                            ) : (
                              s.docTitle || s.source
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          )
        })
      )}
      <div ref={endRef} />
      {scrolled && (
        <button
          className="thread-scroll-top"
          title="Scroll to top"
          onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUpIcon size={16} />
        </button>
      )}
    </div>
  )
}

export default ChatThread
