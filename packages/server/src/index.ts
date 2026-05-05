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
import { relayRoutes } from './routes/relay'
import { keyRoutes } from './routes/keys'
import { groupRoutes } from './routes/groups'
import { policyRoutes } from './routes/policies'
import { directoryRoutes } from './routes/directories'
import { chatRoutes } from './routes/chat'
import { RelayRoom } from './relay/relay-room'
import { runIndexer } from './indexer/chain-indexer'

const app = new Hono<{ Bindings: Env }>()

/**
 * Phase 6 (O-Low#2): CORS origin allowlist. The previous `cors()` call with
 * no options accepted ALL origins, which made the open reference deploy
 * usable for cross-origin browser callers but also blew the cross-origin
 * threat model wide open.
 *
 * New posture:
 *   - Production deployers MUST set `CORS_ALLOWED_ORIGINS` (comma-separated
 *     list of allowed origins, e.g. `https://directory.epicflowstate.ai`).
 *   - When the env var is unset OR empty, we still emit no-CORS headers
 *     (i.e. the response is single-origin only). Same-origin requests
 *     work fine because the browser doesn't enforce CORS on those.
 *   - The wildcard `*` is supported as an explicit opt-in for reference
 *     deploys / local dev that want the old behavior.
 *
 * SECURITY.md documents this contract.
 */
app.use('*', (c, next) => {
  const raw = c.env.CORS_ALLOWED_ORIGINS ?? ''
  const allowed = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const wildcardAll = allowed.includes('*')

  return cors({
    origin: origin => {
      if (!origin) return ''
      if (wildcardAll) return origin
      if (allowed.includes(origin)) return origin
      return null
    },
    credentials: false,
  })(c, next)
})

// Root — redirect browsers, return JSON for API clients
app.get('/', c => {
  const accept = c.req.header('Accept') ?? ''
  // Production redirects browsers to the public docs site
  // (saga-server.epicdm.workers.dev is an API-only origin). For
  // staging / dev we return the JSON endpoints map even when the
  // Accept header is text/html, so operators can introspect the
  // worker in a browser without being kicked out to prod docs.
  // Detect non-prod via SERVER_NAME containing the env tag — the
  // wrangler env blocks set this to "SAGA Reference Hub (Staging)"
  // for staging and similar for any future preview environments.
  const serverName = c.env.SERVER_NAME ?? 'SAGA Reference Hub'
  const isProductionLike = !/\((staging|dev|local|preview)\)/i.test(serverName)
  if (isProductionLike && accept.includes('text/html')) {
    return c.redirect('https://saga-standard.dev')
  }
  return c.json({
    name: serverName,
    version: SERVER_VERSION,
    sagaVersion: '1.0',
    docs: 'https://saga-standard.dev',
    registry: 'https://registry.saga-standard.dev',
    endpoints: {
      server: '/v1/server',
      agents: '/v1/agents',
      orgs: '/v1/orgs',
      resolve: '/v1/resolve/:identity',
      auth: '/v1/auth/challenge',
      health: '/health',
      keys: '/v1/keys/:handle',
      relay: '/v1/relay',
      groups: '/v1/groups',
      policies: '/v1/orgs/:orgId/policy',
      directories: '/v1/directories',
      chat: '/v1/chat/conversations',
    },
  })
})

// Mount routes
app.route('/v1/auth', authRoutes)
app.route('/v1/agents', agentRoutes)
app.route('/v1/transfers', transferRoutes)
app.route('/v1/resolve', resolveRoutes)
app.route('/v1/orgs', orgRoutes)
app.route('/v1/orgs', policyRoutes)
app.route('/v1/keys', keyRoutes)
app.route('/v1/directories', directoryRoutes)
app.route('/v1/groups', groupRoutes)
app.route('/v1', serverInfoRoute)
app.route('/v1', relayRoutes)

app.route('/v1/chat', chatRoutes)

// Document routes are nested under agents
app.route('/v1/agents', documentRoutes)

// Health check
app.get('/health', c => c.json({ status: 'ok' }))

// Admin: manually trigger indexer (requires ADMIN_SECRET)
app.post('/admin/reindex', async c => {
  const secret = c.env.ADMIN_SECRET
  if (!secret) {
    return c.json({ error: 'Admin endpoint not configured', code: 'FORBIDDEN' }, 403)
  }
  const provided = c.req.header('X-Admin-Secret')
  if (provided !== secret) {
    return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
  }

  try {
    // Log config for debugging
    const rpc = c.env.BASE_RPC_URL ?? '(unset)'
    const agent = c.env.AGENT_IDENTITY_CONTRACT ?? '(unset)'
    const org = c.env.ORG_IDENTITY_CONTRACT ?? '(unset)'
    const chain = c.env.INDEXER_CHAIN ?? 'eip155:84532'
    const start = c.env.INDEXER_START_BLOCK ?? '0'
    const cursor = await c.env.INDEXER_STATE.get('indexer:lastBlock')

    // Use console.warn for indexer diagnostics — `no-console: error` rule
    // (Phase 6 G-Med#2) restricts console.log in production code; warn/error
    // are the sanctioned channels and these admin-endpoint diagnostics
    // legitimately need to ship to operator logs.
    console.warn(
      `[indexer] config: rpc=${rpc} agent=${agent} org=${org} chain=${chain} startBlock=${start} cursor=${cursor}`
    )

    await runIndexer(c.env)

    const newCursor = await c.env.INDEXER_STATE.get('indexer:lastBlock')
    console.warn(`[indexer] done. cursor: ${cursor} -> ${newCursor}`)

    return c.json({ status: 'ok', cursor: newCursor, prevCursor: cursor })
  } catch (err) {
    console.error('[indexer] error:', err)
    return c.json(
      { status: 'error', message: err instanceof Error ? err.message : String(err) },
      500
    )
  }
})

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
export { RelayRoom }
