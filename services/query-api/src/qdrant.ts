import { QdrantClient } from '@qdrant/js-client-rest'

// Prefer env (the cloud cluster the Electron app + loader use); fall back to local Docker.
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333'
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined
const COLLECTION = 'nerd-chunks'
// Collection uses NAMED vectors (dense + sparse), so queries must say which to use.
const DENSE_VECTOR = process.env.QDRANT_DENSE_VECTOR || 'dense'

const client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY })

// Same shape the Electron app already consumes (src/shared/types.ts -> RetrievedChunk).
export interface RetrievedChunk {
  id: string
  docId: string
  source: string
  docTitle: string
  url: string
  text: string
  score: number
  updatedAt: number
  pinned: boolean
  channelName: string
}

interface ChunkPayload {
  doc_id?: string
  source?: string
  doc_title?: string
  url?: string
  text?: string
  updated_at?: number | string
  source_metadata?: { pinned?: boolean; channel_name?: string }
}

export async function searchByVector(vector: number[], limit = 20): Promise<RetrievedChunk[]> {
  const res = await client.query(COLLECTION, {
    query: vector,
    using: DENSE_VECTOR,
    limit,
    with_payload: true
  })
  return res.points.map((p) => {
    const pl = (p.payload ?? {}) as ChunkPayload
    return {
      id: String(p.id),
      docId: pl.doc_id ?? '',
      source: pl.source ?? 'slack',
      docTitle: pl.doc_title ?? '',
      url: pl.url ?? '',
      text: pl.text ?? '',
      score: p.score ?? 0,
      updatedAt:
        typeof pl.updated_at === 'string' ? Date.parse(pl.updated_at) : (pl.updated_at ?? 0),
      pinned: pl.source_metadata?.pinned ?? false,
      channelName: pl.source_metadata?.channel_name ?? ''
    }
  })
}
