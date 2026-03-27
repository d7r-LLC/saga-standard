// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockD1, runMigrations } from './test-helpers'
import { drizzle } from 'drizzle-orm/d1'
import { directories } from '../db/schema'
import { type FederationLinkManager, createFederationLinkManager } from '../relay/federation-link'

class MockOutboundWebSocket {
  sent: string[] = []
  readyState = 1
  private listeners = new Map<string, Array<(ev: unknown) => void>>()

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  removeEventListener(): void {
    // no-op for tests
  }

  dispatchEvent(): boolean {
    return true
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
  }

  simulateMessage(data: unknown): void {
    for (const fn of this.listeners.get('message') ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent)
    }
  }

  simulateOpen(): void {
    for (const fn of this.listeners.get('open') ?? []) {
      fn({} as Event)
    }
  }

  simulateClose(): void {
    for (const fn of this.listeners.get('close') ?? []) {
      fn({} as CloseEvent)
    }
  }
}

describe('FederationLinkManager', () => {
  let db: D1Database
  let manager: FederationLinkManager
  let mockWs: MockOutboundWebSocket
  let wsFactory: (url: string) => MockOutboundWebSocket

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)

    const orm = drizzle(db)
    await orm.insert(directories).values({
      id: 'dir_remote',
      directoryId: 'remote-hub',
      url: 'https://remote.example.com',
      operatorWallet: '0xremote',
      conformanceLevel: 'full',
      status: 'active',
      chain: 'eip155:84532',
      tokenId: 1,
      contractAddress: '0xdircontract',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    mockWs = new MockOutboundWebSocket()
    wsFactory = vi.fn(() => mockWs)

    manager = createFederationLinkManager({
      db,
      localDirectoryId: 'local-hub',
      localOperatorWallet: '0xlocal',
      signChallenge: async (challenge: string) => `sig-${challenge}`,
      createWebSocket: wsFactory,
    })
  })

  it('resolves directory URL and opens WebSocket with correct URL', async () => {
    const forwardPromise = manager.forward('remote-hub', {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@local-hub',
      to: 'bob@remote-hub',
      ct: 'encrypted',
      ts: new Date().toISOString(),
      id: 'msg-001',
    })

    // Yield for async directory URL lookup
    await new Promise(r => setTimeout(r, 10))

    expect(wsFactory).toHaveBeenCalledWith('wss://remote.example.com/v1/relay/federation')

    mockWs.simulateMessage({
      type: 'federation:challenge',
      challenge: 'saga-federation:test:123',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })

    // Wait a tick for async signChallenge
    await new Promise(r => setTimeout(r, 10))

    expect(mockWs.sent.length).toBeGreaterThanOrEqual(1)
    const authMsg = JSON.parse(mockWs.sent[0])
    expect(authMsg.type).toBe('federation:auth')
    expect(authMsg.directoryId).toBe('local-hub')

    mockWs.simulateMessage({ type: 'federation:success', directoryId: 'local-hub' })

    await forwardPromise
    const forwardMsg = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
    expect(forwardMsg.type).toBe('relay:forward')
    expect(forwardMsg.envelope.id).toBe('msg-001')
    expect(forwardMsg.sourceDirectoryId).toBe('local-hub')
  })

  it('reuses existing connection for same directory', async () => {
    const p1 = manager.forward('remote-hub', {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@local-hub',
      to: 'bob@remote-hub',
      ct: 'enc1',
      ts: new Date().toISOString(),
      id: 'msg-001',
    })

    // Yield for async directory URL lookup
    await new Promise(r => setTimeout(r, 10))

    mockWs.simulateMessage({
      type: 'federation:challenge',
      challenge: 'saga-federation:test:123',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })
    await new Promise(r => setTimeout(r, 10))
    mockWs.simulateMessage({ type: 'federation:success', directoryId: 'local-hub' })
    await p1

    await manager.forward('remote-hub', {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@local-hub',
      to: 'bob@remote-hub',
      ct: 'enc2',
      ts: new Date().toISOString(),
      id: 'msg-002',
    })

    expect(wsFactory).toHaveBeenCalledTimes(1)
  })

  it('throws when directory not found in D1', async () => {
    await expect(
      manager.forward('nonexistent-hub', {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@local-hub',
        to: 'bob@nonexistent-hub',
        ct: 'enc',
        ts: new Date().toISOString(),
        id: 'msg-001',
      })
    ).rejects.toThrow('not found')
  })

  it('throws when directory NFT is missing', async () => {
    const orm = drizzle(db)
    await orm.insert(directories).values({
      id: 'dir_no_nft',
      directoryId: 'no-nft-hub',
      url: 'https://nonft.example.com',
      operatorWallet: '0xnonft',
      conformanceLevel: 'basic',
      status: 'active',
      chain: 'eip155:84532',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await expect(
      manager.forward('no-nft-hub', {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@local-hub',
        to: 'bob@no-nft-hub',
        ct: 'enc',
        ts: new Date().toISOString(),
        id: 'msg-001',
      })
    ).rejects.toThrow('NFT')
  })

  it('closes all links on cleanup', async () => {
    const p1 = manager.forward('remote-hub', {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@local-hub',
      to: 'bob@remote-hub',
      ct: 'enc',
      ts: new Date().toISOString(),
      id: 'msg-001',
    })

    // Yield for async directory URL lookup
    await new Promise(r => setTimeout(r, 10))

    mockWs.simulateMessage({
      type: 'federation:challenge',
      challenge: 'saga-federation:test:123',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    })
    await new Promise(r => setTimeout(r, 10))
    mockWs.simulateMessage({ type: 'federation:success', directoryId: 'local-hub' })
    await p1

    manager.closeAll()
    expect(mockWs.readyState).toBe(3)
  })
})
