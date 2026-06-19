import type { QdrantClient } from '@nerd/rag-clients'
import type { SourceKind } from '@nerd/shared'
import type { SparseVector } from '../lib/bm25.js'

export const COLLECTION = 'nerd-chunks'
const VECTOR_SIZE = 1536
const BATCH_SIZE = 50

export interface QdrantPointInsert {
  id: string
  docId: string
  source: SourceKind
  docTitle: string | null
  url: string | null
  sourceMetadata: Record<string, unknown>
  text: string
  vector: number[]
  sparseVector: SparseVector
  updatedAt: number
}

export async function ensureCollection(client: QdrantClient): Promise<void> {
  const collections = await client.getCollections()
  const exists = collections.collections.some((c) => c.name === COLLECTION)
  if (exists) return

  await client.createCollection(COLLECTION, {
    vectors: { dense: { size: VECTOR_SIZE, distance: 'Cosine' } },
    sparse_vectors: { sparse: {} }
  })
}

export async function upsertPoints(
  client: QdrantClient,
  points: QdrantPointInsert[]
): Promise<void> {
  if (points.length === 0) return

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      vector: {
        dense: p.vector,
        sparse: { indices: p.sparseVector.indices, values: p.sparseVector.values }
      },
      payload: {
        docId: p.docId,
        source: p.source,
        docTitle: p.docTitle,
        url: p.url,
        sourceMetadata: p.sourceMetadata,
        text: p.text,
        updatedAt: p.updatedAt
      }
    }))
    await client.upsert(COLLECTION, { wait: true, points: batch })
  }
}

export async function deleteByDocId(client: QdrantClient, docId: string): Promise<void> {
  await client.delete(COLLECTION, {
    wait: true,
    filter: { must: [{ key: 'docId', match: { value: docId } }] }
  })
}
