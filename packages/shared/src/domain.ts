export type SourceKind = 'gdocs' | 'slack' | 'github' | 'notion' | 'pitch'

export interface Document {
  id: string
  source: SourceKind
  title: string | null
  url: string | null
  contentHash: string
  sourceMetadata: Record<string, unknown>
  lastSyncedAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Chunk {
  id: string
  docId: string
  chunkIndex: number
  text: string
  tokenCount: number
}

export interface QdrantPoint {
  id: string
  docId: string
  source: SourceKind
  docTitle: string | null
  url: string | null
  sourceMetadata: Record<string, unknown>
  text: string
  vector: number[]
  sparseVector?: Record<number, number>
  updatedAt: number
}

export interface Mode {
  id: string
  name: string
  systemPrompt: string
  isDefault: boolean
}

export type OutputFormat = 'list' | 'paragraph'

export interface AnticipatedQuestion {
  question: string
  answer: string
  source: string
}

export interface BriefingResponse {
  briefing: string
  anticipatedQuestions: AnticipatedQuestion[]
  contextAge: string
  sourcesLoaded: number
}

export interface SyncRun {
  id: number
  source: SourceKind
  startedAt: number
  finishedAt: number | null
  docsScanned: number
  docsNew: number
  docsUpdated: number
  docsSkipped: number
  docsDeleted: number
  errors: Array<{ message: string; docId?: string }>
}

export interface Citation {
  docId: string
  docTitle: string | null
  url: string | null
  source: SourceKind
}

export interface AnswerToken {
  requestId: string
  token: string
  done: boolean
  citations?: Citation[]
}

export interface TranscriptUtterance {
  speaker: 'me' | 'them'
  text: string
  startMs: number
  endMs: number
  isFinal: boolean
}
