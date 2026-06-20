import pg from 'pg'

// Local Postgres — edit here if your setup differs (no .env plumbing on purpose).
const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'localdb',
  user: 'admin',
  password: 'password',
  max: 5
})

// The SQL is written by the AI, so refuse anything that isn't a read. A READ ONLY
// transaction (below) is the real guarantee; this just rejects obvious writes early.
const READ_ONLY = /^\s*(select|with)\b/i

export interface SqlResult {
  rows: unknown[]
  rowCount: number
  fields: { name: string; dataTypeID: number }[]
}

export async function runSql(sql: string, params: unknown[] = []): Promise<SqlResult> {
  if (!READ_ONLY.test(sql)) {
    throw Object.assign(new Error('Only SELECT / WITH queries are allowed'), { statusCode: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    await client.query('SET LOCAL statement_timeout = 5000') // never hang on a runaway query
    const res = await client.query(sql, params)
    await client.query('COMMIT')
    return {
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
      fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }))
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
