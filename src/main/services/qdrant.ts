import { QdrantClient } from '@qdrant/js-client-rest'
import { ENV, COLLECTION } from '../config/env'
import type { RetrievedChunk } from '@shared/types'

let client: QdrantClient | null = null
function qd(): QdrantClient {
  if (!client) client = new QdrantClient({ url: ENV.qdrantUrl, apiKey: ENV.qdrantApiKey })
  return client
}

// ponytail: dense-only retrieval. Full hybrid (dense + sparse/BM25 RRF) needs the
// SAME sparse encoder the cron uses at index time to vectorize the query; that encoder
// doesn't live in the Electron app yet. Ceiling: weaker recall on exact tokens
// (acronyms, GST, numbers). Upgrade path: share the cron's BM25 encoder (or use Qdrant
// server-side sparse inference) and switch to client.query() with prefetch + RRF fusion.
const denseVector =
  (import.meta.env as unknown as Record<string, string | undefined>)
    .MAIN_VITE_QDRANT_DENSE_VECTOR || undefined

interface ChunkPayload {
  doc_id?: string
  source?: string
  doc_title?: string
  url?: string
  text?: string
  updated_at?: number | string
  source_metadata?: { pinned?: boolean }
}

// ponytail: the REST client call isn't wired to an AbortSignal (its fetch options
// aren't surfaced cleanly); the per-stage timeout wrapper still bounds wall-clock.
export async function searchChunks(vector: number[], limit = 20): Promise<RetrievedChunk[]> {
  const res = await qd().query(COLLECTION, {
    query: vector,
    ...(denseVector ? { using: denseVector } : {}),
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
      pinned: pl.source_metadata?.pinned ?? false
    }
  })
}
