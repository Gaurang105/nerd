import type { OpenAI } from '@nerd/rag-clients'

const BATCH_SIZE = 100
const MODEL = 'text-embedding-3-small'

export async function batchEmbed(texts: string[], openai: OpenAI): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const response = await openai.embeddings.create({ model: MODEL, input: batch })
    const sorted = [...response.data].sort((a, b) => a.index - b.index)
    results.push(...sorted.map((e) => e.embedding))
  }
  return results
}
