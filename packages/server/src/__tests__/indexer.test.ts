// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { createMockD1, runMigrations } from './test-helpers'
import { processDecodedLog } from '../indexer/chain-indexer'
import type { DecodedEventLog } from '../indexer/chain-indexer'
import {
  handleAgentRegistered,
  handleAgentTransfer,
  handleOrgRegistered,
  safeTokenId,
} from '../indexer/event-handlers'
import type { EventMeta } from '../indexer/types'
import { agents, organizations } from '../db/schema'

const AGENT_CONTRACT = '0xagent0000000000000000000000000000000001'
const ORG_CONTRACT = '0xorg00000000000000000000000000000000000001'
const CHAIN = 'eip155:84532'
const OWNER = '0xaabbccddee1234567890aabbccddee1234567890'

let mockDb: D1Database
let db: ReturnType<typeof drizzle>

beforeEach(async () => {
  mockDb = createMockD1()
  await runMigrations(mockDb)
  db = drizzle(mockDb)
})

// ── safeTokenId ──────────────────────────────────────────────────────

describe('safeTokenId', () => {
  it('converts small bigint to number', () => {
    expect(safeTokenId(42n)).toBe(42)
    expect(safeTokenId(0n)).toBe(0)
    expect(safeTokenId(1000000n)).toBe(1000000)
  })

  it('converts MAX_SAFE_INTEGER correctly', () => {
    expect(safeTokenId(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('throws for values exceeding MAX_SAFE_INTEGER', () => {
    const oversized = BigInt(Number.MAX_SAFE_INTEGER) + 1n
    expect(() => safeTokenId(oversized)).toThrow('exceeds Number.MAX_SAFE_INTEGER')
  })
})

// ── Event handlers (direct) ──────────────────────────────────────────

describe('handleAgentRegistered', () => {
  const meta: EventMeta = {
    txHash: '0xtx123',
    contractAddress: AGENT_CONTRACT.toLowerCase(),
    chain: CHAIN,
    blockNumber: 100n,
  }

  it('inserts a new agent when handle does not exist', async () => {
    await handleAgentRegistered(
      db,
      {
        tokenId: 42n,
        handle: 'new.agent',
        owner: OWNER,
        hubUrl: 'https://hub.example.com',
        registeredAt: 1000n,
      },
      meta
    )

    const rows = await db.select().from(agents).where(eq(agents.handle, 'new.agent'))
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenId).toBe(42)
    expect(rows[0].walletAddress).toBe(OWNER.toLowerCase())
    expect(rows[0].homeHubUrl).toBe('https://hub.example.com')
  })

  it('upserts NFT fields when handle already exists (off-chain agent)', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind('agent_existing', 'existing.agent', OWNER.toLowerCase(), CHAIN, now, now)
      .run()

    await handleAgentRegistered(
      db,
      {
        tokenId: 99n,
        handle: 'existing.agent',
        owner: OWNER,
        hubUrl: 'https://hub.example.com',
        registeredAt: 2000n,
      },
      meta
    )

    const rows = await db.select().from(agents).where(eq(agents.handle, 'existing.agent'))
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('agent_existing')
    expect(rows[0].tokenId).toBe(99)
    expect(rows[0].homeHubUrl).toBe('https://hub.example.com')
  })
})

describe('handleAgentTransfer', () => {
  it('updates wallet address for the token', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, token_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('agent_1', 'xfer.agent', OWNER.toLowerCase(), CHAIN, now, now, 10)
      .run()

    const newOwner = '0x1111111111111111111111111111111111111111'
    await handleAgentTransfer(db, { from: OWNER, to: newOwner, tokenId: 10n })

    const rows = await db.select().from(agents).where(eq(agents.handle, 'xfer.agent'))
    expect(rows[0].walletAddress).toBe(newOwner.toLowerCase())
  })
})

describe('handleOrgRegistered', () => {
  const meta: EventMeta = {
    txHash: '0xtx456',
    contractAddress: ORG_CONTRACT.toLowerCase(),
    chain: CHAIN,
    blockNumber: 200n,
  }

  it('inserts a new org', async () => {
    await handleOrgRegistered(
      db,
      { tokenId: 1n, handle: 'new.org', name: 'New Org', owner: OWNER, registeredAt: 1000n },
      meta
    )

    const rows = await db.select().from(organizations).where(eq(organizations.handle, 'new.org'))
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenId).toBe(1)
    expect(rows[0].name).toBe('New Org')
  })

  it('upserts when handle already exists (idempotent on replay)', async () => {
    await handleOrgRegistered(
      db,
      { tokenId: 5n, handle: 'replay.org', name: 'Org V1', owner: OWNER, registeredAt: 1000n },
      meta
    )

    await handleOrgRegistered(
      db,
      { tokenId: 5n, handle: 'replay.org', name: 'Org V2', owner: OWNER, registeredAt: 1000n },
      meta
    )

    const rows = await db.select().from(organizations).where(eq(organizations.handle, 'replay.org'))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Org V2')
  })
})

// ── processDecodedLog (dispatch logic) ──────────────────────────────

describe('processDecodedLog', () => {
  const meta: EventMeta = {
    txHash: '0xtx789',
    contractAddress: AGENT_CONTRACT.toLowerCase(),
    chain: CHAIN,
    blockNumber: 100n,
  }

  it('dispatches Transfer event for agent contract', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, token_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('agent_t1', 'transfer.agent', OWNER.toLowerCase(), CHAIN, now, now, 1)
      .run()

    const newOwner = '0x2222222222222222222222222222222222222222'

    const log: DecodedEventLog = {
      eventName: 'Transfer',
      args: { from: OWNER, to: newOwner, tokenId: 1n },
      address: AGENT_CONTRACT,
    }

    await processDecodedLog(db, log, meta, AGENT_CONTRACT.toLowerCase(), ORG_CONTRACT.toLowerCase())

    const rows = await db.select().from(agents).where(eq(agents.handle, 'transfer.agent'))
    expect(rows[0].walletAddress).toBe(newOwner.toLowerCase())
  })

  it('skips mint Transfer events (from = zero address)', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, token_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('agent_m1', 'mint.agent', OWNER.toLowerCase(), CHAIN, now, now, 2)
      .run()

    const log: DecodedEventLog = {
      eventName: 'Transfer',
      args: {
        from: '0x0000000000000000000000000000000000000000',
        to: OWNER,
        tokenId: 2n,
      },
      address: AGENT_CONTRACT,
    }

    await processDecodedLog(db, log, meta, AGENT_CONTRACT.toLowerCase(), ORG_CONTRACT.toLowerCase())

    const rows = await db.select().from(agents).where(eq(agents.handle, 'mint.agent'))
    expect(rows[0].walletAddress).toBe(OWNER.toLowerCase())
  })

  it('dispatches AgentRegistered event', async () => {
    const log: DecodedEventLog = {
      eventName: 'AgentRegistered',
      args: {
        tokenId: 42n,
        handle: 'decoded.agent',
        owner: OWNER,
        hubUrl: 'https://hub.test',
        registeredAt: 1234567890n,
      },
      address: AGENT_CONTRACT,
    }

    await processDecodedLog(db, log, meta, AGENT_CONTRACT.toLowerCase(), ORG_CONTRACT.toLowerCase())

    const rows = await db.select().from(agents).where(eq(agents.handle, 'decoded.agent'))
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenId).toBe(42)
    expect(rows[0].homeHubUrl).toBe('https://hub.test')
  })

  it('dispatches OrgRegistered event', async () => {
    const orgMeta: EventMeta = { ...meta, contractAddress: ORG_CONTRACT.toLowerCase() }
    const log: DecodedEventLog = {
      eventName: 'OrgRegistered',
      args: {
        tokenId: 7n,
        handle: 'decoded.org',
        name: 'Decoded Org',
        owner: OWNER,
        registeredAt: 1234567890n,
      },
      address: ORG_CONTRACT,
    }

    await processDecodedLog(
      db,
      log,
      orgMeta,
      AGENT_CONTRACT.toLowerCase(),
      ORG_CONTRACT.toLowerCase()
    )

    const rows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.handle, 'decoded.org'))
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenId).toBe(7)
    expect(rows[0].name).toBe('Decoded Org')
  })

  it('ignores logs from unrecognized addresses', async () => {
    const log: DecodedEventLog = {
      eventName: 'Transfer',
      args: { from: OWNER, to: '0x1111111111111111111111111111111111111111', tokenId: 1n },
      address: '0x9999999999999999999999999999999999999999',
    }

    // Should not throw
    await processDecodedLog(db, log, meta, AGENT_CONTRACT.toLowerCase(), ORG_CONTRACT.toLowerCase())
  })

  it('ignores AgentRegistered from org contract address', async () => {
    const log: DecodedEventLog = {
      eventName: 'AgentRegistered',
      args: {
        tokenId: 1n,
        handle: 'wrong.contract',
        owner: OWNER,
        hubUrl: 'https://hub.test',
        registeredAt: 1000n,
      },
      address: ORG_CONTRACT,
    }

    await processDecodedLog(db, log, meta, AGENT_CONTRACT.toLowerCase(), ORG_CONTRACT.toLowerCase())

    const rows = await db.select().from(agents).where(eq(agents.handle, 'wrong.contract'))
    expect(rows).toHaveLength(0)
  })
})
