// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './bindings'
import { authRoutes } from './routes/auth'
import { agentRoutes } from './routes/agents'
import { documentRoutes } from './routes/documents'
import { transferRoutes } from './routes/transfers'
import { serverInfoRoute } from './routes/server-info'

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
    version: '0.1.0',
    sagaVersion: '1.0',
    docs: 'https://saga-standard.dev',
    registry: 'https://registry.saga-standard.dev',
    endpoints: {
      server: '/v1/server',
      agents: '/v1/agents',
      auth: '/v1/auth/challenge',
      health: '/health',
    },
  })
})

// Mount routes
app.route('/v1/auth', authRoutes)
app.route('/v1/agents', agentRoutes)
app.route('/v1/transfers', transferRoutes)
app.route('/v1', serverInfoRoute)

// Document routes are nested under agents
app.route('/v1/agents', documentRoutes)

// Health check
app.get('/health', c => c.json({ status: 'ok' }))

export default app
export type { Env }
