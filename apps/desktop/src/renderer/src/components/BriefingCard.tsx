import { useEffect, useState } from 'react'
import type { BriefingResponse } from '@nerd/shared'

export function BriefingCard(): React.JSX.Element {
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const unsubReady = window.nerd.onBriefingReady((b: BriefingResponse) => {
      setBriefing(b)
      setLoading(false)
      setErrorMsg('')
    })
    // Fix 6: listen for briefing errors so loading state always resets
    const unsubError = window.nerd.onBriefingError((msg: string) => {
      setLoading(false)
      setErrorMsg(
        msg.includes('API') ? 'Check your OpenAI API key.' : 'Briefing failed — try again.'
      )
    })
    return () => {
      unsubReady()
      unsubError()
    }
  }, [])

  const generate = async (): Promise<void> => {
    if (!description.trim()) return
    setLoading(true)
    setBriefing(null)
    setErrorMsg('')
    await window.nerd.generateBriefing({ meetingDescription: description })
    // generateBriefing resolves before the briefing arrives (it's async via IPC push).
    // onBriefingReady / onBriefingError handle setLoading(false) — no action needed here.
  }

  return (
    <div className="briefing-card" data-testid="briefing-area">
      {!briefing ? (
        <div className="briefing-input-area" style={{ flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="panel-input"
              placeholder="Describe your meeting to get a briefing…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void generate()
              }}
            />
            <button
              type="button"
              className="briefing-btn"
              onClick={() => void generate()}
              disabled={loading}
            >
              {loading ? '…' : 'Brief me'}
            </button>
          </div>
          {errorMsg && <p className="briefing-error">{errorMsg}</p>}
        </div>
      ) : (
        <div className="briefing-content">
          <div className="briefing-meta">
            <span className="briefing-age">{briefing.contextAge}</span>
            <span className="briefing-sources">{briefing.sourcesLoaded} sources</span>
            <button type="button" className="panel-btn" onClick={() => setBriefing(null)}>
              ↩
            </button>
          </div>
          <p className="briefing-text">{briefing.briefing}</p>
          {briefing.anticipatedQuestions.map((q, i) => (
            <div key={i} className="anticipated-q">
              <p className="aq-question">Q: {q.question}</p>
              <p className="aq-answer">{q.answer}</p>
              <p className="aq-source">{q.source}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
