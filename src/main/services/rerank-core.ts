import type { RetrievedChunk } from '@shared/types'

// Pure retrieval post-processing — no network/env imports, so it is independently
// runnable (see rerank.check.ts).

export const SIM_THRESHOLD = 0.85
export const MIN_SCORE = 0.3
export const MAX_CHUNKS = 15
const RECENCY_WEIGHT = 0.05
const SOURCE_BOOST = 0.04 // authoritative (e.g. pinned) sources win ties

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Collapse near-identical chunks (Slack repeats the same fact across threads).
 * Keeps the highest-scored copy. Pure + order-stable on score.
 */
export function dedup(chunks: RetrievedChunk[], simThreshold = SIM_THRESHOLD): RetrievedChunk[] {
  const sorted = [...chunks].sort((a, b) => b.score - a.score)
  const kept: { chunk: RetrievedChunk; tokens: Set<string> }[] = []
  for (const chunk of sorted) {
    const tokens = tokenSet(chunk.text)
    if (kept.some((k) => jaccard(k.tokens, tokens) >= simThreshold)) continue
    kept.push({ chunk, tokens })
  }
  return kept.map((k) => k.chunk)
}

/**
 * Recency-boost, drop below threshold, cap at max. Pure.
 * Never pads the prompt with junk: if only N clear the bar, returns N.
 */
export function selectTop(
  chunks: RetrievedChunk[],
  { minScore = MIN_SCORE, max = MAX_CHUNKS } = {}
): RetrievedChunk[] {
  const recencies = chunks.map((c) => c.updatedAt).filter((t) => t > 0)
  const newest = Math.max(0, ...recencies)
  const oldest = Math.min(newest, ...(recencies.length ? recencies : [0]))
  const span = newest - oldest || 1
  return chunks
    .filter((c) => c.score >= minScore)
    .map((c) => ({
      c,
      boosted:
        c.score +
        (c.updatedAt > 0 ? ((c.updatedAt - oldest) / span) * RECENCY_WEIGHT : 0) +
        (c.pinned ? SOURCE_BOOST : 0)
    }))
    .sort((a, b) => b.boosted - a.boosted)
    .slice(0, max)
    .map((x) => x.c)
}
