import type { TranscriptTurn } from '@shared/types'

function TranscriptFeed({ turns }: { turns: TranscriptTurn[] }): React.JSX.Element {
  return (
    <div className="card">
      <h4>Live transcript</h4>
      {turns.length === 0 ? (
        <div className="sync-line">Listening… speech will appear here.</div>
      ) : (
        turns.map((t, i) => (
          <div key={i} className={`turn ${t.role} ${t.interim ? 'interim' : ''}`}>
            <span className="who">{t.role === 'me' ? 'Me' : 'Them'}</span> {t.text}
          </div>
        ))
      )}
    </div>
  )
}

export default TranscriptFeed
