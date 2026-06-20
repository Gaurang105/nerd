// Shared contract between main, preload, and renderer. No runtime imports here.

export type OutputFormat = 'list' | 'paragraph'

/** 'me' = user mic, 'them' = counterparty (system audio). */
export type TranscriptRole = 'me' | 'them'

export interface TranscriptTurn {
  role: TranscriptRole
  text: string
  ts: number
  /** true while still an interim (non-final) Deepgram result. */
  interim?: boolean
}

export interface Mode {
  id: string
  name: string
  systemPrompt: string
  isDefault?: boolean
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Actions dispatched to the renderer from main-registered global shortcuts. */
export type ShortcutAction = 'toggleSession' | 'openSettings'

/** User-rebindable global shortcuts. Each is Cmd/Ctrl + the stored single key. */
export type ShortcutId = 'openSettings' | 'hide' | 'toggleSession'
export type ShortcutMap = Record<ShortcutId, string>
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  openSettings: '.',
  hide: '\\',
  toggleSession: 't'
}

export type Theme = 'light' | 'dark'

export interface Appearance {
  theme: Theme
  /** Panel background opacity, 0 (transparent) -> 1 (solid). */
  bgAlpha: number
  /** backdrop-filter blur in px. */
  blur: number
  /** Base font size in px. */
  fontSize: number
  /** Accent color (hex). */
  accent: string
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Settings {
  appearance: Appearance
  bounds: WindowBounds | null
  hidden: boolean
  format: OutputFormat
  shortcuts: ShortcutMap
}

/** A retrieved + reranked KB chunk used to ground an answer. */
export interface RetrievedChunk {
  id: string
  docId: string
  source: string
  docTitle: string
  url: string
  text: string
  score: number
  updatedAt: number
  /** Authoritative signal from source_metadata (e.g. a pinned Slack message). */
  pinned?: boolean
}

/** Source shown next to an answer for citation. */
export interface AnswerSource {
  docTitle: string
  url: string
  source: string
}

export interface AnticipatedQuestion {
  question: string
  answer: string
  source: string
}

export interface BriefingResult {
  briefing: string
  anticipatedQuestions: AnticipatedQuestion[]
  /** Human label e.g. "2h ago" derived from last sync. */
  contextAge: string
  sourcesLoaded: number
}

/** Streaming token delta pushed during generation. */
export interface PartialAnswer {
  requestId: number
  delta: string
}

/** Terminal answer event for a request. */
export interface FinalAnswer {
  requestId: number
  text: string
  sources: AnswerSource[]
  /** true => grounded in internal KB; false => general knowledge. */
  grounded: boolean
  format: OutputFormat
  error?: string
}

export interface SyncStatus {
  lastSyncedAt: number | null
  ageLabel: string
}

/** The surface exposed to the renderer via contextBridge as `window.nerd`. */
export interface NerdAPI {
  // Briefing + Q&A
  runBriefing: (description: string) => Promise<void>
  askManually: (question: string, format: OutputFormat) => Promise<number>
  setOutputFormat: (format: OutputFormat) => Promise<void>
  // Streaming subscriptions (return an unsubscribe fn)
  onPartialAnswer: (cb: (p: PartialAnswer) => void) => () => void
  onAnswer: (cb: (a: FinalAnswer) => void) => () => void
  onBriefingReady: (cb: (b: BriefingResult) => void) => () => void
  // Window shell
  snapToCorner: (corner: Corner) => Promise<void>
  setCollapsed: (collapsed: boolean) => Promise<void>
  setHidden: (hidden: boolean) => Promise<void>
  /** Fit the window to rendered content. `width` null keeps the current width. */
  setContentSize: (width: number | null, height: number) => Promise<void>
  /** Fires when main toggles collapse (e.g. the global shortcut) so the view follows. */
  onCollapsedChanged: (cb: (collapsed: boolean) => void) => () => void
  /** Global-shortcut actions dispatched from main (e.g. 'toggleSession', 'openSettings'). */
  onShortcut: (cb: (action: ShortcutAction) => void) => () => void
  // Settings
  getSettings: () => Promise<Settings>
  setAppearance: (appearance: Appearance) => Promise<void>
  /** Rebind a global shortcut to Cmd/Ctrl + the given single key. */
  setShortcut: (id: ShortcutId, key: string) => Promise<void>
  getSyncStatus: () => Promise<SyncStatus>
  // Audio + transcription
  startCapture: () => Promise<void>
  stopCapture: () => Promise<void>
  onTranscript: (cb: (turns: TranscriptTurn[]) => void) => () => void
  // Modes
  listModes: () => Promise<Mode[]>
  createMode: (name: string, systemPrompt: string) => Promise<Mode[]>
  updateMode: (mode: Mode) => Promise<Mode[]>
  deleteMode: (id: string) => Promise<Mode[]>
  setActiveMode: (id: string) => Promise<Mode[]>
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  bgAlpha: 0.72,
  blur: 18,
  fontSize: 14,
  accent: '#7c8cff'
}
