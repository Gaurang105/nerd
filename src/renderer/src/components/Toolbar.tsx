import {
  ModesIcon,
  EyeIcon,
  EyeOffIcon,
  WaveformIcon,
  PauseIcon,
  RecordIcon,
  TranscriptIcon,
  PlusIcon
} from './icons'

interface Props {
  hidden: boolean
  listening: boolean
  modesOpen: boolean
  showTranscript: boolean
  elapsed: string
  newChatLabel: boolean
  onToggleModes: () => void
  onToggleHidden: () => void
  onToggleListening: () => void
  onToggleTranscript: () => void
  onNewChat: () => void
}

function Toolbar({
  hidden,
  listening,
  modesOpen,
  showTranscript,
  elapsed,
  newChatLabel,
  onToggleModes,
  onToggleHidden,
  onToggleListening,
  onToggleTranscript,
  onNewChat
}: Props): React.JSX.Element {
  return (
    <div className="nerd-footer">
      <div className="toolbar-group">
        <button
          className={`icon-btn ${modesOpen ? 'on' : ''}`}
          data-tip="Modes"
          onClick={onToggleModes}
        >
          <ModesIcon />
        </button>
        <button
          className={`icon-btn ${hidden ? 'on' : ''}`}
          data-tip={hidden ? 'Hidden from screen share' : 'Visible to screen share'}
          onClick={onToggleHidden}
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        {listening ? (
          <>
            <button className="icon-btn live" data-tip="Stop listening" onClick={onToggleListening}>
              <PauseIcon size={16} />
            </button>
            <span className="rec-cluster">
              <RecordIcon size={10} className="rec-dot" />
              <span className="timer">{elapsed}</span>
            </span>
          </>
        ) : (
          <button className="icon-btn" data-tip="Start listening" onClick={onToggleListening}>
            <WaveformIcon />
          </button>
        )}
        <button
          className={`icon-btn ${showTranscript ? 'on' : ''}`}
          data-tip={showTranscript ? 'Hide transcript' : 'Show transcript'}
          onClick={onToggleTranscript}
        >
          <TranscriptIcon />
        </button>
      </div>
      <div className="toolbar-group right">
        <button className="icon-btn new-chat tip-end" data-tip="New chat" onClick={onNewChat}>
          {newChatLabel && <span className="new-chat-label">New chat</span>}
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  )
}

export default Toolbar
