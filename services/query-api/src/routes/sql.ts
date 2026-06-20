import type { FastifyInstance } from 'fastify'
import { runSql } from '../db.js'

interface SqlBody {
  sql?: string
  params?: unknown[]
}

export async function sqlRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SqlBody }>('/sql', async (req, reply) => {
    const { sql, params } = req.body ?? {}
    if (typeof sql !== 'string' || !sql.trim()) {
      return reply.code(400).send({ error: 'Body must include a non-empty "sql" string' })
    }
    try {
      const result = await runSql(sql, params ?? [])
      return result
    } catch (err) {
      const e = err as { statusCode?: number; message?: string }
      req.log.warn({ err: e.message }, 'sql query failed')
      return reply.code(e.statusCode ?? 400).send({ error: e.message ?? 'Query failed' })
    }
  })
}
