import type { BriefingResult } from '@shared/types'

function BriefingCard({ briefing }: { briefing: BriefingResult }): React.JSX.Element {
  return (
    <div className="card">
      <h4>
        Pre-call briefing · {briefing.sourcesLoaded} sources · synced {briefing.contextAge}
      </h4>
      <div className="answer-body">{briefing.briefing}</div>
      {briefing.anticipatedQuestions.map((q, i) => (
        <div className="briefing-q" key={i}>
          <div className="q">{q.question}</div>
          <div className="answer-body">{q.answer}</div>
          {q.source && <div className="src">{q.source}</div>}
        </div>
      ))}
    </div>
  )
}

export default BriefingCard
