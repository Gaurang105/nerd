import { CohereClient } from 'cohere-ai'

export type { CohereClient }

export interface CohereClientConfig {
  apiKey: string
}

export function createCohereClient(cfg: CohereClientConfig): CohereClient {
  return new CohereClient({ token: cfg.apiKey })
}
