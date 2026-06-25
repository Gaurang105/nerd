import type OpenAI from 'openai'
import { gatewaySql } from './gateway'
import { isReadOnly } from './sqlTool-core'

const MAX_SCHEMA_TABLES = 60
const MAX_ROWS = 50

let schemaCache: string | null = null

interface ColumnRow {
  table_name: string
  column_name: string
  data_type: string
}

/** Compact `table(col type, ...)` description of the public schema, cached for the session. */
export async function getSchema(signal?: AbortSignal): Promise<string> {
  if (schemaCache != null) return schemaCache
  const rows = await gatewaySql<ColumnRow>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
    [],
    signal
  )
  const byTable = new Map<string, string[]>()
  for (const r of rows) {
    const cols = byTable.get(r.table_name) ?? []
    cols.push(`${r.column_name} ${r.data_type}`)
    byTable.set(r.table_name, cols)
  }
  // ponytail: ceiling — a very large public schema bloats the prompt. Cap the table
  // count and note the omission. Upgrade path: restrict to a tour-relevant allowlist.
  const tables = [...byTable.entries()]
  const shown = tables.slice(0, MAX_SCHEMA_TABLES)
  const lines = shown.map(([t, cols]) => `${t}(${cols.join(', ')})`)
  if (tables.length > shown.length) {
    lines.push(`... ${tables.length - shown.length} more tables omitted`)
  }
  schemaCache = lines.join('\n')
  return schemaCache
}

export const SQL_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'query_database',
    description:
      'Run a read-only SQL query against the company Postgres database to answer ' +
      'structured questions (filters, counts, aggregations, date ranges). Use the table ' +
      'definitions in the DATABASE section of the prompt. Only a single SELECT/WITH ' +
      'statement is allowed.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A single read-only SQL SELECT statement.' }
      },
      required: ['sql'],
      additionalProperties: false
    }
  }
}

export interface SqlToolResult {
  /** JSON string handed back to the model as the tool result (rows capped to MAX_ROWS). */
  raw: string
  rowCount: number
  /** Full result rows on success, for deterministic rendering; undefined on error. */
  rows?: Record<string, unknown>[]
}

/** Run a model-proposed query behind the read-only guard; row count drives answer grounding. */
export async function runSqlTool(sql: string, signal?: AbortSignal): Promise<SqlToolResult> {
  if (!isReadOnly(sql)) {
    return {
      raw: JSON.stringify({ error: 'Only read-only SELECT/WITH queries are allowed.' }),
      rowCount: 0
    }
  }
  try {
    const rows = await gatewaySql<Record<string, unknown>>(sql, [], signal)
    const truncated = rows.length > MAX_ROWS
    const raw = JSON.stringify({
      rowCount: rows.length,
      truncated,
      rows: truncated ? rows.slice(0, MAX_ROWS) : rows
    })
    return { raw, rowCount: rows.length, rows }
  } catch (err) {
    return { raw: JSON.stringify({ error: (err as Error).message }), rowCount: 0 }
  }
}
