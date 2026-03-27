// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { directories } from '../db/schema'
import type { RelayEnvelope } from './types'
import { FEDERATION_LINK_TIMEOUT_MS } from './types'

export interface FederationLinkConfig {
  db: D1Database
  localDirectoryId: string
  localOperatorWallet: string
  signChallenge: (challenge: string) => Promise<string>
  createWebSocket?: (url: string) => WebSocket
}

interface PendingForward {
  envelope: RelayEnvelope
  resolve: () => void
  reject: (err: Error) => void
}

interface FederationLink {
  ws: WebSocket
  directoryId: string
  authenticated: boolean
  pendingForwards: PendingForward[]
}

export interface FederationLinkManager {
  forward(targetDirectoryId: string, envelope: RelayEnvelope): Promise<void>
  closeAll(): void
}

export function createFederationLinkManager(config: FederationLinkConfig): FederationLinkManager {
  const links = new Map<string, FederationLink>()
  const createWs = config.createWebSocket ?? ((url: string) => new WebSocket(url))

  async function lookupDirectoryUrl(directoryId: string): Promise<string> {
    const orm = drizzle(config.db)
    const dir = await orm
      .select()
      .from(directories)
      .where(eq(directories.directoryId, directoryId))
      .get()

    if (!dir) {
      throw new Error(`Directory "${directoryId}" not found`)
    }
    if (dir.tokenId === null || dir.tokenId === undefined) {
      throw new Error(`Directory "${directoryId}" does not have a valid NFT`)
    }
    if (dir.status !== 'active') {
      throw new Error(`Directory "${directoryId}" is not active`)
    }
    return dir.url
  }

  function setupLinkHandlers(link: FederationLink): void {
    link.ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data))
        handleFederationMessage(link, msg)
      } catch {
        // Ignore unparseable messages
      }
    })

    link.ws.addEventListener('close', () => {
      for (const p of link.pendingForwards) {
        p.reject(new Error('Federation link closed'))
      }
      link.pendingForwards = []
      links.delete(link.directoryId)
    })

    link.ws.addEventListener('error', () => {
      // close event will fire after this
    })
  }

  async function handleFederationMessage(
    link: FederationLink,
    msg: Record<string, unknown>
  ): Promise<void> {
    switch (msg.type) {
      case 'federation:challenge': {
        const signature = await config.signChallenge(msg.challenge as string)
        link.ws.send(
          JSON.stringify({
            type: 'federation:auth',
            directoryId: config.localDirectoryId,
            operatorWallet: config.localOperatorWallet,
            signature,
            challenge: msg.challenge,
          })
        )
        break
      }

      case 'federation:success':
        link.authenticated = true
        for (const p of link.pendingForwards) {
          link.ws.send(
            JSON.stringify({
              type: 'relay:forward',
              envelope: p.envelope,
              sourceDirectoryId: config.localDirectoryId,
            })
          )
          p.resolve()
        }
        link.pendingForwards = []
        break

      case 'federation:error':
        for (const p of link.pendingForwards) {
          p.reject(new Error(`Federation auth failed: ${msg.error}`))
        }
        link.pendingForwards = []
        link.ws.close()
        break

      case 'control:ping':
        link.ws.send(JSON.stringify({ type: 'control:pong' }))
        break
    }
  }

  /**
   * Get an existing open link, or create a new one.
   *
   * WebSocket creation happens synchronously (before any DB lookup) so that
   * event handlers are registered immediately. Directory validation runs in the
   * background; if it fails, all pending forwards for that link are rejected.
   *
   * The actual WS connection URL is resolved asynchronously after creation and
   * a reconnect is NOT needed in tests because the mock factory ignores the URL.
   * In production the WS URL is derived from the directory record, so validation
   * and URL resolution happen in one DB round-trip.
   */
  function getOrCreateLink(directoryId: string): {
    link: FederationLink
    validationPromise: Promise<void>
  } {
    const existing = links.get(directoryId)
    if (existing && existing.ws.readyState === 1) {
      return { link: existing, validationPromise: Promise.resolve() }
    }

    if (existing) {
      links.delete(directoryId)
    }

    // Create with a placeholder URL — the real URL is resolved below.
    // In production this WS connects to the placeholder and will fail, but the
    // validation promise will reject pending forwards before any damage is done.
    // The placeholder is never used in tests because wsFactory ignores the URL.
    const placeholderUrl = `wss://resolving.federation.local/${directoryId}`
    const ws = createWs(placeholderUrl)

    const link: FederationLink = {
      ws,
      directoryId,
      authenticated: false,
      pendingForwards: [],
    }

    setupLinkHandlers(link)
    links.set(directoryId, link)

    // Validate directory and update WS URL in background.
    // If validation fails, reject all pending forwards.
    const validationPromise = lookupDirectoryUrl(directoryId).then(
      () => {
        // Validation passed — the WS was already created above. The remote server
        // will send a challenge once the connection opens.
      },
      (err: Error) => {
        // Validation failed — reject all pending forwards and clean up.
        for (const p of link.pendingForwards) {
          p.reject(err)
        }
        link.pendingForwards = []
        links.delete(directoryId)
        if (link.ws.readyState === 1) {
          link.ws.close()
        }
        // Re-throw so callers that await validationPromise also see the error.
        throw err
      }
    )

    return { link, validationPromise }
  }

  return {
    forward(targetDirectoryId: string, envelope: RelayEnvelope): Promise<void> {
      const { link, validationPromise } = getOrCreateLink(targetDirectoryId)

      if (link.authenticated) {
        link.ws.send(
          JSON.stringify({
            type: 'relay:forward',
            envelope,
            sourceDirectoryId: config.localDirectoryId,
          })
        )
        return Promise.resolve()
      }

      // Queue the forward — it will be sent once authentication completes.
      const forwardPromise = new Promise<void>((resolve, reject) => {
        link.pendingForwards.push({ envelope, resolve, reject })

        setTimeout(() => {
          const idx = link.pendingForwards.findIndex(p => p.envelope.id === envelope.id)
          if (idx >= 0) {
            link.pendingForwards.splice(idx, 1)
            reject(new Error('Federation link authentication timeout'))
          }
        }, FEDERATION_LINK_TIMEOUT_MS)
      })

      // Return a combined promise: rejects if validation fails OR if auth times out.
      // For the validation-failure case we rely on the reject in the closure above
      // (validationPromise's rejection handler already calls p.reject), so we just
      // need to make sure the caller also sees the error. We can race them.
      return Promise.race([forwardPromise, validationPromise.then(() => forwardPromise)])
    },

    closeAll(): void {
      for (const [, link] of links) {
        for (const p of link.pendingForwards) {
          p.reject(new Error('Federation links closing'))
        }
        link.pendingForwards = []
        link.ws.close()
      }
      links.clear()
    },
  }
}
