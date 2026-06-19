import { decode, encode } from 'gpt-tokenizer'
import type { Chunk } from '@nerd/shared'

export interface ChunkOptions {
  targetTokens?: number
  overlapTokens?: number
}

export function chunk(text: string, docId: string, opts: ChunkOptions = {}): Omit<Chunk, 'id'>[] {
  const target = opts.targetTokens ?? 400
  const overlap = opts.overlapTokens ?? 50

  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const result: Omit<Chunk, 'id'>[] = []
  let chunkIndex = 0
  let currentTokens: number[] = []

  const flush = (): void => {
    if (currentTokens.length === 0) return
    const chunkText = decode(currentTokens)
    result.push({
      docId,
      chunkIndex,
      text: chunkText,
      tokenCount: currentTokens.length
    })
    chunkIndex++
    currentTokens = currentTokens.slice(-overlap)
  }

  for (const para of paragraphs) {
    const paraTokens = encode(para)

    if (paraTokens.length > target) {
      const sentences = para.split(/(?<=[.!?])\s+/)
      for (const sentence of sentences) {
        const sentTokens = encode(sentence)
        if (currentTokens.length + sentTokens.length > target) {
          flush()
        }
        currentTokens.push(...sentTokens)
      }
    } else {
      if (currentTokens.length + paraTokens.length > target) {
        flush()
      }
      currentTokens.push(...paraTokens)
    }
  }

  if (currentTokens.length > 0) {
    flush()
  }

  return result
}
