import 'dotenv/config' // load services/query-api/.env (QDRANT_URL, QDRANT_API_KEY, ...) into process.env
import Fastify from 'fastify'
import { healthRoute } from './routes/health.js'
import { sqlRoute } from './routes/sql.js'
import { searchRoute } from './routes/search.js'

const PORT = 3841
const HOST = '127.0.0.1'

const app = Fastify({ logger: true })

await app.register(healthRoute)
await app.register(sqlRoute)
await app.register(searchRoute)

try {
  await app.listen({ port: PORT, host: HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
