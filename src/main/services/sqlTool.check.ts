import assert from 'node:assert'
import { assembleToolCalls, isReadOnly, toSqlResult } from './sqlTool-core'

// Runnable self-check for the pure tool-calling helpers. Run: npx tsx <thisfile>

// 1) read-only guard accepts SELECT/WITH (any casing/whitespace), rejects writes.
assert.ok(isReadOnly('SELECT * FROM tours'), 'plain SELECT allowed')
assert.ok(isReadOnly('  with t as (select 1) select * from t'), 'leading CTE allowed')
assert.ok(!isReadOnly('DELETE FROM tours'), 'DELETE rejected')
assert.ok(!isReadOnly('update tours set x = 1'), 'UPDATE rejected')
assert.ok(!isReadOnly('drop table tours'), 'DROP rejected')

// 2) streamed tool_call deltas at the same index reassemble into one call with merged args.
const merged = assembleToolCalls([
  { index: 0, id: 'call_1', type: 'function', function: { name: 'query_database', arguments: '{"sql":"SE' } },
  { index: 0, function: { arguments: 'LECT 1"}' } }
])
assert.strictEqual(merged.length, 1, 'same-index deltas merge into one call')
assert.strictEqual(merged[0].id, 'call_1')
assert.strictEqual(merged[0].name, 'query_database')
assert.strictEqual(merged[0].arguments, '{"sql":"SELECT 1"}', 'argument fragments concatenate in order')

// 3) two concurrent tool calls stay separate and are ordered by index.
const two = assembleToolCalls([
  { index: 1, id: 'b', function: { name: 'y', arguments: '{}' } },
  { index: 0, id: 'a', function: { name: 'x', arguments: '{}' } }
])
assert.strictEqual(two.length, 2)
assert.strictEqual(two[0].id, 'a', 'calls sorted by index')
assert.strictEqual(two[1].id, 'b')

// 4) toSqlResult extracts columns from the first row and reports the true total.
const small = toSqlResult('select id, name from tours', [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], 200)
assert.deepStrictEqual(small.columns, ['id', 'name'], 'columns come from first row keys')
assert.strictEqual(small.rowCount, 2)
assert.strictEqual(small.truncated, false)
assert.strictEqual(small.rows.length, 2)

// 5) display cap slices rows but rowCount stays the true total and truncated flips.
const big = toSqlResult('select id from tours', Array.from({ length: 130 }, (_, i) => ({ id: i })), 50)
assert.strictEqual(big.rows.length, 50, 'displayed rows capped')
assert.strictEqual(big.rowCount, 130, 'rowCount is the true total')
assert.strictEqual(big.truncated, true, 'truncated when total exceeds the cap')

// 6) empty result set yields no columns and no rows.
const empty = toSqlResult('select 1', [], 50)
assert.deepStrictEqual(empty.columns, [])
assert.strictEqual(empty.rowCount, 0)
assert.strictEqual(empty.truncated, false)

console.log('sqlTool-core self-check passed')
