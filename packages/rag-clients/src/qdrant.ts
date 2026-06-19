import { QdrantClient } from '@qdrant/js-client-rest'

export type { QdrantClient }

export interface QdrantClientConfig {
  url: string
  apiKey: string
}

export function createQdrantClient(cfg: QdrantClientConfig): QdrantClient {
  return new QdrantClient({ url: cfg.url, apiKey: cfg.apiKey })
}
