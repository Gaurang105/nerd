import type { RetrievedChunk } from '@shared/types'
import { gatewaySearch } from './gateway'

// Retrieval now goes through the gateway service (which talks to Qdrant Cloud and
// handles the named dense-vector query). The app never connects to Qdrant directly.
export async function searchChunks(vector: number[], limit = 20): Promise<RetrievedChunk[]> {
  return gatewaySearch(vector, limit)
}
