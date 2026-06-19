import { useEffect, useRef, useState } from 'react'
import type {
  Appearance,
  BriefingResult,
  Corner,
  FinalAnswer,
  Mode,
  OutputFormat,
  TranscriptTurn
} from '@shared/types'
import { DEFAULT_APPEARANCE } from '@shared/types'
import WidgetHeader from './components/WidgetHeader'
import BriefingCard from './components/BriefingCard'
import AnswerPanel from './components/AnswerPanel'
import ManualInputBar from './components/ManualInputBar'
import ConfigPanel from './components/ConfigPanel'
import ModesPanel from './components/ModesPanel'
import TranscriptFeed from './components/TranscriptFeed'
import * as audio from './audio/capture'

function appearanceStyle(a: Appearance): React.CSSProperties {
  return {
    '--nerd-bg-alpha': a.bgAlpha,
    '--nerd-blur': `${a.blur}px`,
    '--nerd-font-size': `${a.fontSize}px`,
    '--nerd-accent': a.accent
  } as React.CSSProperties
}

function App(): React.JSX.Element {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [format, setFormat] = useState<OutputFormat>('list')
  const [hidden, setHidden] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const [briefing, setBriefing] = useState<BriefingResult | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [syncLabel, setSyncLabel] = useState('unknown')

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([])
  const [modes, setModes] = useState<Mode[]>([])

  const [answerText, setAnswerText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [final, setFinal] = useState<FinalAnswer | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    void window.nerd.getSettings().then((s) => {
      setAppearance(s.appearance)
      setFormat(s.format)
      setHidden(s.hidden)
    })
    void window.nerd.getSyncStatus().then((s) => setSyncLabel(s.ageLabel))
    void window.nerd.listModes().then(setModes)

    const offPartial = window.nerd.onPartialAnswer((p) => {
      if (p.requestId < reqId.current) return
      if (p.requestId > reqId.current) {
        // A newer answer (often a hotkey trigger) started — reset and surface it.
        reqId.current = p.requestId
        setAnswerText('')
        setFinal(null)
        setStreaming(true)
        setShowConfig(false)
      }
      setAnswerText((t) => t + p.delta)
    })
    const offAnswer = window.nerd.onAnswer((a) => {
      if (a.requestId < reqId.current) return
      reqId.current = a.requestId
      setStreaming(false)
      setFinal(a)
      if (a.error && a.error !== 'cancelled') setAnswerText(a.error)
    })
    const offBriefing = window.nerd.onBriefingReady((b) => {
      setBriefing(b)
      setBriefingLoading(false)
      setSyncLabel(b.contextAge)
    })
    const offTranscript = window.nerd.onTranscript(setTranscript)
    return () => {
      offPartial()
      offAnswer()
      offBriefing()
      offTranscript()
    }
  }, [])

  const changeAppearance = (a: Appearance): void => {
    setAppearance(a)
    void window.nerd.setAppearance(a)
  }

  const changeFormat = (f: OutputFormat): void => {
    setFormat(f)
    void window.nerd.setOutputFormat(f)
  }

  const ask = async (q: string): Promise<void> => {
    setAnswerText('')
    setFinal(null)
    setStreaming(true)
    setShowConfig(false)
    reqId.current = await window.nerd.askManually(q, format)
  }

  const toggleHidden = (): void => {
    const next = !hidden
    setHidden(next)
    void window.nerd.setHidden(next)
  }

  const toggleListening = async (): Promise<void> => {
    if (listening) {
      audio.stopCapture()
      await window.nerd.stopCapture()
      setListening(false)
      setTranscript([])
    } else {
      await window.nerd.startCapture() // open Deepgram before frames flow
      await audio.startCapture()
      setListening(true)
    }
  }

  const collapse = (): void => {
    setCollapsed(true)
    void window.nerd.setCollapsed(true)
  }
  const expand = (): void => {
    setCollapsed(false)
    void window.nerd.setCollapsed(false)
  }

  const snap = (c: Corner): void => void window.nerd.snapToCorner(c)

  const runBriefing = (desc: string): void => {
    setBriefingLoading(true)
    setShowConfig(false)
    void window.nerd.runBriefing(desc)
  }

  const rootClass = `theme-${appearance.theme}`

  if (collapsed) {
    return (
      <div className={`nerd-pill ${rootClass}`} style={appearanceStyle(appearance)}>
        <span className="brand">nerd</span>
        <span className={`nerd-indicator ${hidden ? 'hidden' : 'visible'}`}>
          <span className="dot" />
        </span>
        {listening && (
          <span className="nerd-indicator live">
            <span className="dot" />
          </span>
        )}
        <span className="spacer" />
        <button className="nerd-btn" title="Expand" onClick={expand}>
          ▢
        </button>
      </div>
    )
  }

  return (
    <div className={`nerd-overlay ${rootClass}`} style={appearanceStyle(appearance)}>
      <WidgetHeader
        hidden={hidden}
        listening={listening}
        showConfig={showConfig}
        onToggleConfig={() => setShowConfig((v) => !v)}
        onToggleHidden={toggleHidden}
        onToggleListening={toggleListening}
        onCollapse={collapse}
        onSnap={snap}
      />

      <div className="nerd-body">
        <div className="sync-line">
          Knowledge base synced {syncLabel} · press ⌘+Enter to answer from the conversation
        </div>
        {showConfig ? (
          <>
            <ConfigPanel
              appearance={appearance}
              onAppearanceChange={changeAppearance}
              onRunBriefing={runBriefing}
              briefingLoading={briefingLoading}
            />
            <ModesPanel modes={modes} onChange={setModes} />
          </>
        ) : (
          <>
            {briefing && <BriefingCard briefing={briefing} />}
            <AnswerPanel
              text={answerText}
              streaming={streaming}
              final={final}
              format={format}
              onFormatChange={changeFormat}
            />
            {listening && <TranscriptFeed turns={transcript} />}
          </>
        )}
      </div>

      {!showConfig && <ManualInputBar onAsk={ask} />}
      <div className="resize-grip" />
    </div>
  )
}

export default App
