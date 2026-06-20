import assert from 'node:assert'
import { parseCitations } from './prompts'

// Runnable self-check for the citation parse/strip helper. Run: npx tsx <thisfile>

// 1) A well-formed line cites the listed items (1-based -> 0-based) and is stripped.
const a = parseCitations('The SLA is 99.9%.\nSOURCES: [2, 5]')
assert.deepStrictEqual([...(a.cited ?? [])].sort(), [1, 4], 'parses 1-based numbers to 0-based')
assert.strictEqual(a.text, 'The SLA is 99.9%.', 'strips the trailing SOURCES line')

// 2) An empty list cites nothing (greeting case) but is still a parsed result, not a fallback.
const b = parseCitations('Doing well, ready to help.\nSOURCES: []')
assert.notStrictEqual(b.cited, null, 'empty list is a real parse, not a fallback')
assert.strictEqual(b.cited?.size, 0, 'empty list cites nothing')
assert.strictEqual(b.text, 'Doing well, ready to help.')

// 3) A missing line falls back to null so callers keep prior behavior.
const c = parseCitations('Just an answer with no citation line.')
assert.strictEqual(c.cited, null, 'missing line yields null (fallback)')
assert.strictEqual(c.text, 'Just an answer with no citation line.')

// 4) Tolerates whitespace and a missing newline before the sentinel.
const d = parseCitations('Answer.   SOURCES: [ 3 ]')
assert.deepStrictEqual([...(d.cited ?? [])], [2], 'tolerates spaces around the number')
assert.strictEqual(d.text, 'Answer.', 'trims whitespace left after stripping')

// 5) Garbage numbers are ignored, not crashed on.
const e = parseCitations('x\nSOURCES: [1, foo, 0, -2, 3]')
assert.deepStrictEqual([...(e.cited ?? [])].sort(), [0, 2], 'keeps only valid 1-based indices')

console.log('citations self-check passed')
