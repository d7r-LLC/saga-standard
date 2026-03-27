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
   * Resolves the directory URL from D1 and validates NFT status before
   * creating the WebSocket connection with the real URL.
   */
  async function getOrCreateLink(directoryId: string): Promise<FederationLink> {
    const existing = links.get(directoryId)
    if (existing && existing.ws.readyState === 1) {
      return existing
    }

    if (existing) {
      links.delete(directoryId)
    }

    // Resolve the real URL before creating the WebSocket
    const directoryUrl = await lookupDirectoryUrl(directoryId)
    const wsUrl = `${directoryUrl.replace(/^https?:\/\//, 'wss://')}/v1/relay/federation`
    const ws = createWs(wsUrl)

    const link: FederationLink = {
      ws,
      directoryId,
      authenticated: false,
      pendingForwards: [],
    }

    setupLinkHandlers(link)
    links.set(directoryId, link)

    return link
  }

  return {
    async forward(targetDirectoryId: string, envelope: RelayEnvelope): Promise<void> {
      const link = await getOrCreateLink(targetDirectoryId)

      if (link.authenticated) {
        link.ws.send(
          JSON.stringify({
            type: 'relay:forward',
            envelope,
            sourceDirectoryId: config.localDirectoryId,
          })
        )
        return
      }

      // Queue the forward -- sent once authentication completes.
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = link.pendingForwards.findIndex(p => p.envelope.id === envelope.id)
          if (idx >= 0) {
            link.pendingForwards.splice(idx, 1)
            reject(new Error('Federation link authentication timeout'))
          }
        }, FEDERATION_LINK_TIMEOUT_MS)

        link.pendingForwards.push({
          envelope,
          resolve: () => {
            clearTimeout(timer)
            resolve()
          },
          reject: (err: Error) => {
            clearTimeout(timer)
            reject(err)
          },
        })
      })
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
