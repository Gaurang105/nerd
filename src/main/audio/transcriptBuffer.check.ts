import assert from 'node:assert'
import { TranscriptBuffer } from './transcriptBuffer'

// Runnable self-check for the hot transcript buffer. Run: npx tsx <thisfile>

const now = 1_000_000_000_000

// 1) Time eviction: turns older than 120s are dropped.
{
  const b = new TranscriptBuffer()
  b.addFinal('them', 'old turn', now - 130_000)
  b.addFinal('me', 'fresh turn', now - 5_000)
  const text = b.recentText(now)
  assert.ok(!text.includes('old turn'), 'turn older than 120s should be evicted')
  assert.ok(text.includes('fresh turn'), 'fresh turn should remain')
}

// 2) Turn cap: never more than 12 turns retained.
{
  const b = new TranscriptBuffer()
  for (let i = 0; i < 20; i++) b.addFinal('me', `turn ${i}`, now - 1000 + i)
  const turns = b.liveTurns(now)
  assert.strictEqual(turns.length, 12, 'should cap at 12 turns')
  assert.ok(turns[0].text === 'turn 8', 'should keep the most recent 12')
}

// 3) Interim is shown but replaced by the final.
{
  const b = new TranscriptBuffer()
  b.setInterim('them', 'typing in progress')
  assert.ok(b.recentText(now).includes('typing in progress'), 'interim should appear in feed')
  b.addFinal('them', 'committed sentence', now)
  assert.ok(!b.recentText(now).includes('typing in progress'), 'interim cleared after final')
  assert.ok(b.recentText(now).includes('committed sentence'))
}

// 4) Answer memory: last 3, each truncated to ~200 chars.
{
  const b = new TranscriptBuffer()
  for (let i = 0; i < 5; i++) b.addAnswer(`answer ${i}`)
  const ans = b.recentAnswers()
  assert.ok(!ans.includes('answer 1'), 'older answers beyond last 3 should drop')
  assert.ok(ans.includes('answer 4'), 'newest answer should be kept')
  b.clear()
  b.addAnswer('x'.repeat(500))
  assert.strictEqual(
    b.recentAnswers().replace('1. ', '').length,
    200,
    'answer truncated to 200 chars'
  )
}

console.log('transcriptBuffer self-check passed')
