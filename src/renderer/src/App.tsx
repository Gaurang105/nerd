import { useEffect, useRef, useState } from 'react'
import type { Mode, OutputFormat, ShortcutAction, TranscriptTurn } from '@shared/types'
import { buildHistory } from '@shared/history'
import Toolbar from './components/Toolbar'
import ChatThread, { type QATurn } from './components/ChatThread'
import ModeDropdown from './components/ModeDropdown'
import Settings, { type Tab } from './Settings'
import { BackIcon, ExpandIcon, SendIcon, WaveformIcon } from './components/icons'
import { useFitWindow } from './useFitWindow'
import * as audio from './audio/capture'

const SCREEN_QUESTION = 'What am I currently seeing on my screen?'
// cmd+Enter "Assist": send a context-grounded prompt but show a short "Assist" bubble.
const ASSIST_PROMPT =
  'Assist me with what is currently on my screen and in this conversation. ' +
  'If it relates to Headout, use Headout knowledge; otherwise answer generally.'
const ASSIST_LABEL = 'Assist'

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function App(): React.JSX.Element {
  const [format] = useState<OutputFormat>('list')
  const [hidden, setHidden] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [modesOpen, setModesOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<Tab>('general')
  const [composerOpen, setComposerOpen] = useState(false)

  const [listening, setListening] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([])
  const [modes, setModes] = useState<Mode[]>([])

  // Completed Q&A turns. The current in-flight question/answer lives in the fields
  // below and is appended here once it finalizes.
  const [history, setHistory] = useState<QATurn[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [status, setStatus] = useState('')
  const [streaming, setStreaming] = useState(false)
  const reqId = useRef(0)
  // Mirror the in-flight Q&A so the (once-registered) onAnswer handler can archive it.
  const questionRef = useRef<string | null>(null)
  const answerRef = useRef('')
  // Mirror completed turns so ask() (incl. the stale-closure cmd+Enter handler) reads the latest.
  const historyRef = useRef<QATurn[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFitWindow(overlayRef, null)

  useEffect(() => {
    questionRef.current = question
    answerRef.current = answerText
    historyRef.current = history
  })

  useEffect(() => {
    void window.nerd.getSettings().then((s) => setHidden(s.hidden))
    void window.nerd.listModes().then(setModes)

    const offPartial = window.nerd.onPartialAnswer((p) => {
      if (p.requestId < reqId.current) return
      if (p.requestId > reqId.current) {
        reqId.current = p.requestId
        setAnswerText('')
        setStreaming(true)
        setModesOpen(false)
      }
      setStatus('')
      setAnswerText((t) => t + p.delta)
    })
    const offStatus = window.nerd.onAnswerStatus((s) => {
      if (s.requestId >= reqId.current) setStatus(s.text)
    })
    const offAnswer = window.nerd.onAnswer((a) => {
      if (a.requestId < reqId.current) return
      reqId.current = a.requestId
      setStreaming(false)
      setStatus('')
      if (a.error === 'cancelled') return
      // Archive the finished turn into history and clear the in-flight fields.
      setHistory((h) => [
        ...h,
        {
          question: questionRef.current,
          answer: a.text || answerRef.current,
          streaming: false,
          final: a
        }
      ])
      setQuestion(null)
      setAnswerText('')
    })
    const offTranscript = window.nerd.onTranscript(setTranscript)
    const offCollapsed = window.nerd.onCollapsedChanged(setCollapsed)
    return () => {
      offPartial()
      offStatus()
      offAnswer()
      offTranscript()
      offCollapsed()
    }
  }, [])

  useEffect(() => {
    if (!listening) return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [listening])

  const ask = async (q: string, label?: string): Promise<void> => {
    setQuestion(label ?? q)
    setAnswerText('')
    setStatus('')
    setStreaming(true)
    setModesOpen(false)
    const history = buildHistory(
      historyRef.current.map((t) => ({
        question: t.question,
        answer: t.answer,
        error: t.final?.error
      }))
    )
    reqId.current = await window.nerd.askManually(q, format, history)
  }

  const submitDraft = (): void => {
    const q = draft.trim()
    if (!q) return
    void ask(q)
    setDraft('')
    setComposerOpen(false)
  }

  const revealComposer = (): void => {
    setComposerOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const newChat = (): void => {
    reqId.current += 1
    setHistory([])
    setQuestion(null)
    setAnswerText('')
    setStatus('')
    setStreaming(false)
    setDraft('')
    setComposerOpen(false)
    setModesOpen(false)
    setShowTranscript(false)
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
      // Keep the transcript visible after stopping; it clears on the next start.
    } else {
      setTranscript([])
      await window.nerd.startCapture()
      await audio.startCapture()
      setElapsed(0)
      setListening(true)
    }
  }

  const expand = (): void => {
    setCollapsed(false)
    void window.nerd.setCollapsed(false)
  }

  const pickMode = async (id: string): Promise<void> => {
    setModes(await window.nerd.setActiveMode(id))
    setModesOpen(false)
  }

  const openSettings = (tab: Tab = 'general'): void => {
    setModesOpen(false)
    setSettingsTab(tab)
    setShowSettings(true)
  }

  // Global shortcuts dispatched from main: cmd+T toggles the session, cmd+. toggles settings.
  // The handler lives in a ref (refreshed each render) so the IPC listener subscribes exactly
  // once — no re-subscription churn that could double-fire and cancel the toggle.
  const shortcutRef = useRef<(a: ShortcutAction) => void>(() => {})
  useEffect(() => {
    shortcutRef.current = (action: ShortcutAction): void => {
      switch (action) {
        case 'toggleSession':
          void toggleListening()
          break
        case 'openSettings':
          setModesOpen(false)
          setSettingsTab('general')
          setShowSettings((v) => !v)
          break
        default: {
          const _exhaustive: never = action
          return _exhaustive
        }
      }
    }
  })
  useEffect(() => window.nerd.onShortcut((a) => shortcutRef.current(a)), [])

  // Tab reveals the hidden composer; cmd/ctrl+Enter fires the "Assist" action.
  useEffect(() => {
    if (showSettings || collapsed) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void ask(ASSIST_PROMPT, ASSIST_LABEL)
      } else if (e.key === 'Tab' && !composerOpen) {
        e.preventDefault()
        revealComposer()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOpen, showSettings, collapsed])

  const qaTurns: QATurn[] =
    question !== null
      ? [...history, { question, answer: answerText, streaming, final: null }]
      : history

  const hasThread = qaTurns.length > 0 || streaming || showTranscript

  if (collapsed) {
    return (
      <div className="nerd-pill">
        <span className="brand">Nerd</span>
        {listening && <WaveformIcon size={14} className="pill-live" />}
        <span className="spacer" />
        <button className="icon-btn" title="Expand" onClick={expand}>
          <ExpandIcon size={14} />
        </button>
      </div>
    )
  }

  if (showSettings) {
    return (
      <Settings
        onClose={() => setShowSettings(false)}
        onModesChanged={setModes}
        initialTab={settingsTab}
      />
    )
  }

  return (
    <div className="nerd-overlay" ref={overlayRef}>
      <div className={`nerd-topbar ${hasThread ? 'active' : 'idle'}`}>
        {hasThread && (
          <button className="icon-btn" title="Focus input" onClick={revealComposer}>
            <BackIcon size={16} />
          </button>
        )}
        <span className="hint">{hasThread ? 'Press tab to focus' : 'Press cmd + \\ to hide'}</span>
      </div>

      {(hasThread || composerOpen) && (
        <div className="nerd-body">
          {hasThread && (
            <ChatThread
              turns={qaTurns}
              transcript={transcript}
              showTranscript={showTranscript}
              status={status}
            />
          )}
          {composerOpen && (
            <div className="nerd-composer">
              <input
                ref={inputRef}
                className="composer-input"
                placeholder="Ask Nerd a question…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setComposerOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitDraft()
                  } else if (e.key === 'Escape') {
                    setComposerOpen(false)
                  }
                }}
              />
              <button
                className="icon-btn send"
                title="Ask (Enter)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={submitDraft}
              >
                <SendIcon size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      <Toolbar
        hidden={hidden}
        listening={listening}
        modesOpen={modesOpen}
        showTranscript={showTranscript}
        elapsed={mmss(elapsed)}
        newChatLabel={!hasThread}
        onToggleModes={() => setModesOpen((v) => !v)}
        onScreen={() => void ask(SCREEN_QUESTION)}
        onToggleHidden={toggleHidden}
        onToggleListening={toggleListening}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        onNewChat={newChat}
      />

      {modesOpen && (
        <ModeDropdown
          modes={modes}
          onPick={(id) => void pickMode(id)}
          onOpenSettings={() => openSettings('modes')}
        />
      )}
    </div>
  )
}

export default App
