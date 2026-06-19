export interface QdrantClientConfig {
  url: string
  apiKey: string
}

export interface SupabaseClientConfig {
  url: string
  key: string
}

export interface OpenAIClientConfig {
  apiKey: string
}

export interface CohereClientConfig {
  apiKey: string
}

export interface DeepgramClientConfig {
  apiKey: string
}

export function createQdrantClient(_cfg: QdrantClientConfig): unknown {
  throw new Error('qdrant client not yet implemented — lands in slice 3')
}

export function createSupabaseClient(_cfg: SupabaseClientConfig): unknown {
  throw new Error('supabase client not yet implemented — lands in slice 3')
}

export function createOpenAIClient(_cfg: OpenAIClientConfig): unknown {
  throw new Error('openai client not yet implemented — lands in slice 3')
}

export function createCohereClient(_cfg: CohereClientConfig): unknown {
  throw new Error('cohere client not yet implemented — lands in slice 4')
}

export function createDeepgramClient(_cfg: DeepgramClientConfig): unknown {
  throw new Error('deepgram client not yet implemented — lands in slice 6')
}
