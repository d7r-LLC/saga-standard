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
 * "wss://hub.example.com/v1/relay" -> "https://hub.example.com"
 */
function deriveApiBase(hubWssUrl: string): string {
  return hubWssUrl.replace(/^wss:\/\//, 'https://').replace(/\/v1\/relay\/?$/, '')
}

/**
 * Create a key resolver that supports cross-directory key discovery.
 *
 * @param hubUrl       WSS URL of the local hub relay
 * @param fetchFn      Fetch implementation (defaults to globalThis.fetch)
 * @param localDirectoryId  Optional local directory ID. When set, identities with
 *                          a different @directoryId are resolved via the remote hub.
 */
export function createKeyResolver(
  hubUrl: string,
  fetchFn: typeof fetch = globalThis.fetch,
  localDirectoryId?: string
): KeyResolver {
  const keyCache = new Map<string, Uint8Array>()
  const directoryUrlCache = new Map<string, string>()
  const apiBase = deriveApiBase(hubUrl)

  async function resolveDirectoryUrl(directoryId: string): Promise<string> {
    const cached = directoryUrlCache.get(directoryId)
    if (cached) return cached

    const res = await fetchFn(`${apiBase}/v1/directories/${directoryId}`)
    if (!res.ok) {
      throw new Error(`Directory "${directoryId}" not found on local hub`)
    }

    const body = (await res.json()) as { directory: { url: string } }
    const url = body.directory.url
    directoryUrlCache.set(directoryId, url)
    return url
  }

  async function fetchKey(baseUrl: string, handle: string): Promise<Uint8Array> {
    const res = await fetchFn(`${baseUrl}/v1/keys/${handle}`)
    if (!res.ok) {
      throw new Error(`No public key found for ${handle} at ${baseUrl}`)
    }
    const body = (await res.json()) as { publicKey: string }
    return Uint8Array.from(atob(body.publicKey), c => c.charCodeAt(0))
  }

  return {
    async resolve(identity: string): Promise<Uint8Array> {
      const cached = keyCache.get(identity)
      if (cached) return cached

      const atIndex = identity.indexOf('@')
      const handle = atIndex >= 0 ? identity.substring(0, atIndex) : identity
      const directoryId = atIndex >= 0 ? identity.substring(atIndex + 1) : null

      let key: Uint8Array

      // Cross-directory resolution: directoryId present and differs from local
      if (localDirectoryId && directoryId && directoryId !== localDirectoryId) {
        const remoteUrl = await resolveDirectoryUrl(directoryId)
        key = await fetchKey(remoteUrl, handle)
      } else {
        // Local resolution
        key = await fetchKey(apiBase, handle)
      }

      keyCache.set(identity, key)
      return key
    },

    register(identity: string, publicKey: Uint8Array): void {
      keyCache.set(identity, publicKey)
    },
  }
}
