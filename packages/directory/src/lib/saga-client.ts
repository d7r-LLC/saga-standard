// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { SagaServerClient } from '@epicdm/saga-client'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Build a fetch function that routes through a Cloudflare service binding
 * when one is configured, falling back to globalThis.fetch otherwise.
 *
 * Why service bindings: when both saga-directory-staging and
 * saga-server-staging live on the same Cloudflare account, fetching
 * the *.workers.dev hostname of one worker FROM another worker
 * triggers Cloudflare error 1042 ("Workers Internal Error - Worker
 * subrequest failed"). The platform refuses the loopback as a guard
 * against accidental same-account recursion. Service bindings are
 * the supported path: they route requests via Cloudflare's internal
 * RPC, which bypasses public DNS and the loopback guard.
 *
 * The binding is declared in wrangler.jsonc as:
 *   "services": [{ "binding": "SAGA_SERVER", "service": "saga-server-staging" }]
 *
 * Production today still uses the public URL (no service binding
 * declared) — that path may also need a binding eventually but its
 * loopback target is `saga-server` (different name from the directory),
 * so the error doesn't fire there yet.
 */
function buildFetch(env: CloudflareEnv): typeof globalThis.fetch {
  if (env.SAGA_SERVER) {
    const sagaServer = env.SAGA_SERVER
    return ((input: RequestInfo | URL, init?: RequestInit) => {
      // env.SAGA_SERVER.fetch accepts a Request-or-URL like global
      // fetch. The URL's host is replaced internally by Cloudflare —
      // path + query are preserved, which is what saga-client cares about.
      return sagaServer.fetch(input as RequestInfo, init)
    }) as typeof globalThis.fetch
  }
  return globalThis.fetch
}

export async function createSagaClient(): Promise<SagaServerClient> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  return new SagaServerClient({
    serverUrl: env.SAGA_SERVER_URL,
    fetch: buildFetch(env),
  })
}

export async function createAuthenticatedSagaClient(
  sagaToken: string,
): Promise<SagaServerClient> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  return new SagaServerClient({
    serverUrl: env.SAGA_SERVER_URL,
    fetch: buildFetch(env),
    auth: {
      token: sagaToken,
      expiresAt: new Date(Date.now() + 3600000),
      walletAddress: '',
      serverUrl: env.SAGA_SERVER_URL,
    },
  })
}
