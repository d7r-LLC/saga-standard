// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { SERVER_VERSION } from './version'
import type { Env } from './bindings'
import { authRoutes } from './routes/auth'
import { agentRoutes } from './routes/agents'
import { documentRoutes } from './routes/documents'
import { transferRoutes } from './routes/transfers'
import { serverInfoRoute } from './routes/server-info'
import { resolveRoutes } from './routes/resolve'
import { orgRoutes } from './routes/orgs'
import { runIndexer } from './indexer/chain-indexer'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', cors())

// Root — redirect browsers, return JSON for API clients
app.get('/', c => {
  const accept = c.req.header('Accept') ?? ''
  if (accept.includes('text/html')) {
    return c.redirect('https://saga-standard.dev')
  }
  return c.json({
    name: c.env.SERVER_NAME ?? 'SAGA Reference Hub',
    version: SERVER_VERSION,
    sagaVersion: '1.0',
    docs: 'https://saga-standard.dev',
    registry: 'https://registry.saga-standard.dev',
    endpoints: {
      server: '/v1/server',
      agents: '/v1/agents',
      orgs: '/v1/orgs',
      resolve: '/v1/resolve/:handle',
      auth: '/v1/auth/challenge',
      health: '/health',
    },
  })
})

// Mount routes
app.route('/v1/auth', authRoutes)
app.route('/v1/agents', agentRoutes)
app.route('/v1/transfers', transferRoutes)
app.route('/v1/resolve', resolveRoutes)
app.route('/v1/orgs', orgRoutes)
app.route('/v1', serverInfoRoute)

// Document routes are nested under agents
app.route('/v1/agents', documentRoutes)

// Health check
app.get('/health', c => c.json({ status: 'ok' }))

// Named export for testing (tests use app.request())
export { app }

// Default export: Cloudflare Worker module format with fetch + scheduled
// The scheduled handler must be on the default export for CF cron triggers to invoke it
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIndexer(env))
  },
}

export type { Env }
