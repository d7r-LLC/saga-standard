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
