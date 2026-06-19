import type { Chunk } from '@nerd/shared'

export interface ChunkOptions {
  targetTokens?: number
  overlapTokens?: number
}

export function chunk(_text: string, _opts: ChunkOptions = {}): Omit<Chunk, 'docId'>[] {
  throw new Error('chunker not yet implemented — lands in slice 3')
}
