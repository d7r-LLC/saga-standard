// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { createMockD1, runMigrations } from './test-helpers'
import { decideCursorAdvance, processDecodedLog } from '../indexer/chain-indexer'
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
        homeHubUrl: 'https://hub.example.com',
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
        homeHubUrl: 'https://hub.example.com',
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
        homeHubUrl: 'https://hub.test',
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
        homeHubUrl: 'https://hub.test',
        registeredAt: 1000n,
      },
      address: ORG_CONTRACT,
    }

    await processDecodedLog(db, log, meta, AGENT_CONTRACT.toLowerCase(), ORG_CONTRACT.toLowerCase())

    const rows = await db.select().from(agents).where(eq(agents.handle, 'wrong.contract'))
    expect(rows).toHaveLength(0)
  })
})

// ── decideCursorAdvance ─────────────────────────────────────────────
//
// Pure-function tests for the cursor-advance semantics. Pinned tightly
// because a regression here drops events silently. The smoke-test
// scenario this commit fixes:
//
//   Block B = 41124962 contains 4 mint transactions. Each tx emits
//   Transfer (mint, early-return success in processDecodedLog) followed
//   by AgentRegistered/OrgRegistered (which threw with broken D1
//   schema). The PRIOR `lastSuccessBlock` approach advanced the
//   tracker to B on the successful Transfer-mint, then the subsequent
//   Registered event failed — but cursor still committed at B,
//   silently dropping the failed Registered events. The new approach
//   commits cursor at (B - 1) so block B is re-scanned next poll.

describe('decideCursorAdvance', () => {
  it('advances to toBlock on full success (no failure recorded)', () => {
    expect(decideCursorAdvance(null, 100n, 200n)).toBe(200n)
  })

  it('handles equal fromBlock and toBlock (single-block scan, all success)', () => {
    expect(decideCursorAdvance(null, 100n, 100n)).toBe(100n)
  })

  it('rolls back to (firstFailureBlock - 1) when failure is mid-range', () => {
    // Failure at block 150 in a (100..200] scan → next cursor = 149,
    // so blocks 150..200 are re-scanned on the next poll.
    expect(decideCursorAdvance(150n, 100n, 200n)).toBe(149n)
  })

  it('rolls back even when failure is at toBlock (last block in range)', () => {
    // Failure at block 200 in (100..200] → cursor = 199, retry 200 next.
    expect(decideCursorAdvance(200n, 100n, 200n)).toBe(199n)
  })

  it('rolls back to (failure - 1) one block past fromBlock', () => {
    // Smallest non-trivial advance: fromBlock=100, fail at 101 → cursor = 100.
    // The from-block itself processed cleanly (or had no events); next
    // poll re-attempts from 101.
    expect(decideCursorAdvance(101n, 100n, 200n)).toBe(100n)
  })

  it('returns null (no advance) when failure is at fromBlock itself', () => {
    // Loud-stuck: every event in the first scanned block failed.
    // Cursor unmoved → next poll re-attempts the SAME range, surfacing
    // a "not progressing" signal in metrics.
    expect(decideCursorAdvance(100n, 100n, 200n)).toBeNull()
  })

  it('returns null when failure is BEFORE fromBlock (defensive: should not happen in practice)', () => {
    // Caller-side invariant violated; the loop should never record a
    // failure block outside the scan range. Treat as stuck rather than
    // letting a bogus value silently advance the cursor.
    expect(decideCursorAdvance(99n, 100n, 200n)).toBeNull()
  })

  it('does NOT advance into a block that had any failure (regression-pin for smoke-test scenario)', () => {
    // Block 41124962 had: 4 successful Transfer-mint early-returns
    // followed by 4 failing AgentRegistered/OrgRegistered events.
    // Old behavior: cursor = 41124962 (drops the failed events).
    // New behavior: cursor = 41124961 (re-scans block 41124962).
    const cursor = decideCursorAdvance(41124962n, 41124901n, 41125282n)
    expect(cursor).toBe(41124961n)
    // Critical property: cursor must be STRICTLY less than firstFailureBlock.
    expect(cursor!).toBeLessThan(41124962n)
  })

  it('handles realistic block magnitudes without bigint overflow', () => {
    // Sanity: bigint math doesn't truncate on real-world Base block heights.
    const huge = 41_125_282n
    expect(decideCursorAdvance(null, 100n, huge)).toBe(huge)
    expect(decideCursorAdvance(huge - 1n, 100n, huge)).toBe(huge - 2n)
  })
})
