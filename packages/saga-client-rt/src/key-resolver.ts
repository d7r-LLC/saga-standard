// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface KeyResolver {
  /** Resolve a handle to its x25519 public key (fetches from hub if not cached) */
  resolve(identity: string): Promise<Uint8Array>
  /** Manually register a key (overrides cache) */
  register(identity: string, publicKey: Uint8Array): void
}

/**
 * Derives the HTTP API base URL from a WSS relay URL.
 * "wss://hub.example.com/v1/relay" → "https://hub.example.com"
 */
function deriveApiBase(hubWssUrl: string): string {
  return hubWssUrl.replace(/^wss:\/\//, 'https://').replace(/\/v1\/relay\/?$/, '')
}

export function createKeyResolver(
  hubUrl: string,
  fetchFn: typeof fetch = globalThis.fetch
): KeyResolver {
  const cache = new Map<string, Uint8Array>()
  const apiBase = deriveApiBase(hubUrl)

  return {
    async resolve(identity: string): Promise<Uint8Array> {
      const cached = cache.get(identity)
      if (cached) return cached

      const handle = identity.split('@')[0]
      const res = await fetchFn(`${apiBase}/v1/keys/${handle}`)

      if (!res.ok) {
        throw new Error(`No public key found for ${handle}`)
      }

      const body = (await res.json()) as { publicKey: string }
      const decoded = Uint8Array.from(atob(body.publicKey), c => c.charCodeAt(0))
      cache.set(identity, decoded)
      return decoded
    },

    register(identity: string, publicKey: Uint8Array): void {
      cache.set(identity, publicKey)
    },
  }
}
