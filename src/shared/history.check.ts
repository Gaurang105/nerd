import assert from 'node:assert'
import { buildHistory, type HistoryTurn } from './history'

// Runnable self-check for the pure history builder. Run: npx tsx <thisfile>

// 1) in-flight (null question), errored, and empty turns are excluded.
const filtered = buildHistory([
  { question: 'q1', answer: 'a1' },
  { question: null, answer: 'streaming…' },
  { question: 'q-err', answer: 'partial', error: 'cancelled' },
  { question: 'q-empty', answer: '   ' }
])
assert.strictEqual(filtered.length, 2, 'only the one good turn survives (user + assistant)')
assert.deepStrictEqual(
  filtered.map((m) => m.role),
  ['user', 'assistant'],
  'roles alternate user then assistant'
)
assert.strictEqual(filtered[0].content, 'q1')
assert.strictEqual(filtered[1].content, 'a1')

// 2) only the last `maxTurns` turns are kept.
const many: HistoryTurn[] = Array.from({ length: 10 }, (_, i) => ({
  question: `q${i}`,
  answer: `a${i}`
}))
const capped = buildHistory(many, 3)
assert.strictEqual(capped.length, 6, '3 turns => 6 messages')
assert.strictEqual(capped[0].content, 'q7', 'keeps the most recent 3 turns')

// 3) long answers are truncated with an ellipsis.
const long = buildHistory([{ question: 'q', answer: 'x'.repeat(100) }], 6, 10)
assert.strictEqual(long[1].content.length, 11, '10 chars + ellipsis')
assert.ok(long[1].content.endsWith('…'), 'truncation marker appended')

console.log('history self-check passed')
