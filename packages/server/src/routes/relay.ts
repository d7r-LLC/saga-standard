// packages/server/src/routes/relay.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import type { Env } from '../bindings'

export const relayRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/relay — WebSocket upgrade endpoint.
 * Forwards the request to the RelayRoom Durable Object for connection management.
 */
relayRoutes.get('/relay', async c => {
  const upgradeHeader = c.req.header('Upgrade')
  if ((upgradeHeader ?? '').toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade', code: 'UPGRADE_REQUIRED' }, 426)
  }

  const id = c.env.RELAY_ROOM.idFromName('default')
  const stub = c.env.RELAY_ROOM.get(id)
  return stub.fetch(c.req.raw)
})

/**
 * GET /v1/relay/federation — WebSocket upgrade for directory-to-directory federation
 */
relayRoutes.get('/relay/federation', async c => {
  const upgradeHeader = c.req.header('Upgrade')
  if ((upgradeHeader ?? '').toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade', code: 'UPGRADE_REQUIRED' }, 426)
  }

  const id = c.env.RELAY_ROOM.idFromName('default')
  const stub = c.env.RELAY_ROOM.get(id)

  // Append ?federation=true so the DO distinguishes federation from agent connections
  const url = new URL(c.req.url)
  url.searchParams.set('federation', 'true')
  const req = new Request(url.toString(), { headers: c.req.raw.headers })
  return stub.fetch(req)
})
