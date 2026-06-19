import type { FinalAnswer, OutputFormat } from '@shared/types'

interface Props {
  text: string
  streaming: boolean
  final: FinalAnswer | null
  format: OutputFormat
  onFormatChange: (f: OutputFormat) => void
}

function AnswerPanel({ text, streaming, final, format, onFormatChange }: Props): React.JSX.Element {
  const grounded = final?.grounded ?? false
  const hasContent = text.length > 0 || streaming || final
  return (
    <div className="card">
      <div className="answer-toolbar">
        <span className="label">Answer</span>
        <button
          className={`nerd-btn ${format === 'list' ? 'active' : ''}`}
          onClick={() => onFormatChange('list')}
        >
          Pointers
        </button>
        <button
          className={`nerd-btn ${format === 'paragraph' ? 'active' : ''}`}
          onClick={() => onFormatChange('paragraph')}
        >
          Paragraph
        </button>
      </div>

      {final && !final.error && (
        <span className={`answer-tag ${grounded ? 'grounded' : 'general'}`}>
          {grounded ? 'Internal data' : 'General knowledge'}
        </span>
      )}
      {final?.error && <span className="answer-tag general">{final.error}</span>}

      {!hasContent && <div className="sync-line">Ask a question to get an answer.</div>}
      <div className="answer-body">
        {text}
        {streaming && <span className="caret">▍</span>}
      </div>

      {final && final.sources.length > 0 && (
        <div className="answer-sources">
          Sources:{' '}
          {final.sources.map((s, i) => (
            <span key={i}>
              {i > 0 && ', '}
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
  )
}

export default AnswerPanel
