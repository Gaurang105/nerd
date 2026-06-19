import OpenAI from 'openai'

export type { OpenAI }

export interface OpenAIClientConfig {
  apiKey: string
}

export function createOpenAIClient(cfg: OpenAIClientConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey })
}
