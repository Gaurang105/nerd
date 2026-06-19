import assert from 'node:assert'
import type { RetrievedChunk } from '@shared/types'
import { dedup, selectTop } from './rerank-core'

// Runnable self-check for the one non-trivial pure stage. Run: npx tsx <thisfile>

function chunk(id: string, text: string, score: number, updatedAt = 0): RetrievedChunk {
  return { id, docId: id, source: 'slack', docTitle: id, url: '', text, score, updatedAt }
}

// 1) dedup collapses near-identical chunks, keeping the highest-scored copy.
const dups = dedup([
  chunk('a', 'API uptime SLA is 99.9 percent for partners', 0.6),
  chunk('b', 'API uptime SLA is 99.9 percent for partners overall', 0.9),
  chunk('c', 'Payout cycle is net 30 days after invoice', 0.7)
])
assert.strictEqual(dups.length, 2, 'near-identical chunks should collapse to 2')
assert.strictEqual(dups[0].id, 'b', 'dedup keeps the highest-scored copy first')

// 2) selectTop drops sub-threshold chunks.
const filtered = selectTop([
  chunk('hi', 'relevant fact', 0.8),
  chunk('lo', 'irrelevant noise', 0.1)
])
assert.strictEqual(filtered.length, 1, 'sub-threshold chunk should be dropped')
assert.strictEqual(filtered[0].id, 'hi')

// 3) selectTop caps at 8 even when many clear the bar.
const many = Array.from({ length: 20 }, (_, i) => chunk(`c${i}`, `distinct fact number ${i}`, 0.9))
assert.strictEqual(selectTop(many).length, 8, 'should cap at 8 chunks')

// 4) recency boost breaks ties toward the newer chunk.
const now = Date.now()
const tie = selectTop([
  chunk('old', 'stale pricing tier alpha', 0.7, now - 1000 * 60 * 60 * 24 * 30),
  chunk('new', 'fresh pricing tier beta', 0.7, now)
])
assert.strictEqual(tie[0].id, 'new', 'recency boost should rank the newer chunk first')

// 5) authoritative (pinned) boost wins ties at equal score + recency.
const pinnedTie = selectTop([
  { ...chunk('plain', 'payout cycle terms', 0.7, now), pinned: false },
  { ...chunk('pinned', 'payout cycle terms canonical', 0.7, now), pinned: true }
])
assert.strictEqual(pinnedTie[0].id, 'pinned', 'pinned chunk should rank first on a tie')

console.log('rerank-core self-check passed')
