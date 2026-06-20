import type { FastifyInstance } from 'fastify'
import { searchByVector } from '../qdrant.js'

interface SearchBody {
  vector?: number[]
  limit?: number
}

export async function searchRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SearchBody }>('/search', async (req, reply) => {
    const { vector, limit } = req.body ?? {}
    if (!Array.isArray(vector) || vector.length === 0) {
      return reply.code(400).send({ error: 'Body must include a non-empty "vector" array' })
    }
    try {
      const chunks = await searchByVector(vector, limit ?? 20)
      return { chunks }
    } catch (err) {
      const e = err as { message?: string }
      req.log.error({ err: e.message }, 'qdrant search failed')
      return reply.code(502).send({ error: e.message ?? 'Search failed' })
    }
  })
}
