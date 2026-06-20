import { CohereClient } from 'cohere-ai'
import { ENV } from '../config/env'
import type { RetrievedChunk } from '@shared/types'
import { dedup, selectTop, MAX_CHUNKS } from './rerank-core'

export { dedup, selectTop } from './rerank-core'

let client: CohereClient | null = null
function cohere(): CohereClient {
  if (!client) client = new CohereClient({ token: ENV.cohereApiKey })
  return client
}

/**
 * Order of operations (ERD): dedup -> Cohere rerank -> drop below threshold -> top 8.
 * On Cohere failure, fall back to fused score order (selectTop on deduped set).
 */
export async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  signal?: AbortSignal
): Promise<RetrievedChunk[]> {
  const deduped = dedup(chunks)
  if (deduped.length === 0) return []
  try {
    const res = await cohere().rerank(
      {
        model: ENV.rerankModel,
        query,
        documents: deduped.map((c) => c.text),
        topN: Math.min(deduped.length, MAX_CHUNKS * 2)
      },
      { abortSignal: signal }
    )
    const reranked = res.results.map((r) => ({
      ...deduped[r.index],
      score: r.relevanceScore
    }))
    return selectTop(reranked)
  } catch (err) {
    console.error('[rerank] Cohere failed, using fused order', err)
    return selectTop(deduped)
  }
}
