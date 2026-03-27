// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { createMockD1, runMigrations } from './test-helpers'
import {
  handleDirectoryRegistered,
  handleDirectoryStatusUpdated,
  handleDirectoryTransfer,
  handleDirectoryUrlUpdated,
} from '../indexer/event-handlers'
import type { EventMeta } from '../indexer/types'
import { directories } from '../db/schema'

const DIR_CONTRACT = '0xdir0000000000000000000000000000000000001'
const CHAIN = 'eip155:84532'
const OPERATOR = '0xaabbccddee1234567890aabbccddee1234567890'

let mockDb: D1Database
let db: ReturnType<typeof drizzle>

beforeEach(async () => {
  mockDb = createMockD1()
  await runMigrations(mockDb)
  db = drizzle(mockDb)
})

const baseMeta: EventMeta = {
  txHash: '0xtxdir001',
  contractAddress: DIR_CONTRACT.toLowerCase(),
  chain: CHAIN,
  blockNumber: 500n,
}

// ── handleDirectoryRegistered ────────────────────────────────────────

describe('handleDirectoryRegistered', () => {
  it('inserts a new directory when directoryId does not exist', async () => {
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 1n,
        directoryId: 'dir.new',
        operator: OPERATOR,
        url: 'https://dir.example.com',
        conformanceLevel: 'L1',
        registeredAt: 1000n,
      },
      baseMeta
    )

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'dir.new'))
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenId).toBe(1)
    expect(rows[0].operatorWallet).toBe(OPERATOR.toLowerCase())
    expect(rows[0].url).toBe('https://dir.example.com')
    expect(rows[0].conformanceLevel).toBe('L1')
    expect(rows[0].status).toBe('active')
    expect(rows[0].contractAddress).toBe(DIR_CONTRACT.toLowerCase())
    expect(rows[0].mintTxHash).toBe('0xtxdir001')
    expect(rows[0].chain).toBe(CHAIN)
  })

  it('upserts on-chain fields when directoryId already exists (idempotent replay)', async () => {
    const now = new Date().toISOString()
    // Simulate off-chain pre-registration
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_existing',
        'dir.existing',
        'https://old.example.com',
        OPERATOR.toLowerCase(),
        'L0',
        'active',
        CHAIN,
        now,
        now
      )
      .run()

    await handleDirectoryRegistered(
      db,
      {
        tokenId: 42n,
        directoryId: 'dir.existing',
        operator: OPERATOR,
        url: 'https://new.example.com',
        conformanceLevel: 'L2',
        registeredAt: 2000n,
      },
      baseMeta
    )

    const rows = await db
      .select()
      .from(directories)
      .where(eq(directories.directoryId, 'dir.existing'))
    expect(rows).toHaveLength(1)
    // Preserved original id (not replaced)
    expect(rows[0].id).toBe('dir_existing')
    // Updated on-chain fields
    expect(rows[0].tokenId).toBe(42)
    expect(rows[0].url).toBe('https://new.example.com')
    expect(rows[0].conformanceLevel).toBe('L2')
    expect(rows[0].contractAddress).toBe(DIR_CONTRACT.toLowerCase())
  })

  it('is idempotent when called twice with the same event', async () => {
    const event = {
      tokenId: 7n,
      directoryId: 'dir.replay',
      operator: OPERATOR,
      url: 'https://replay.example.com',
      conformanceLevel: 'L1',
      registeredAt: 1000n,
    }

    await handleDirectoryRegistered(db, event, baseMeta)
    await handleDirectoryRegistered(db, event, baseMeta)

    const rows = await db
      .select()
      .from(directories)
      .where(eq(directories.directoryId, 'dir.replay'))
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenId).toBe(7)
  })
})

// ── handleDirectoryStatusUpdated ────────────────────────────────────

describe('handleDirectoryStatusUpdated', () => {
  it('updates directory status by tokenId', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, token_id, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_status_1',
        'dir.status',
        'https://status.example.com',
        OPERATOR.toLowerCase(),
        'L1',
        'active',
        CHAIN,
        10,
        now,
        now
      )
      .run()

    await handleDirectoryStatusUpdated(db, {
      tokenId: 10n,
      oldStatus: 'active',
      newStatus: 'suspended',
    })

    const rows = await db
      .select()
      .from(directories)
      .where(eq(directories.directoryId, 'dir.status'))
    expect(rows[0].status).toBe('suspended')
  })

  it('does not affect other directories', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, token_id, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_a',
        'dir.a',
        'https://a.example.com',
        OPERATOR.toLowerCase(),
        'L1',
        'active',
        CHAIN,
        20,
        now,
        now
      )
      .run()
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, token_id, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_b',
        'dir.b',
        'https://b.example.com',
        OPERATOR.toLowerCase(),
        'L1',
        'active',
        CHAIN,
        21,
        now,
        now
      )
      .run()

    await handleDirectoryStatusUpdated(db, {
      tokenId: 20n,
      oldStatus: 'active',
      newStatus: 'revoked',
    })

    const rowsB = await db.select().from(directories).where(eq(directories.directoryId, 'dir.b'))
    expect(rowsB[0].status).toBe('active')
  })
})

// ── handleDirectoryUrlUpdated ────────────────────────────────────────

describe('handleDirectoryUrlUpdated', () => {
  it('updates directory URL by tokenId', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, token_id, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_url_1',
        'dir.url',
        'https://old-url.example.com',
        OPERATOR.toLowerCase(),
        'L1',
        'active',
        CHAIN,
        30,
        now,
        now
      )
      .run()

    await handleDirectoryUrlUpdated(db, {
      tokenId: 30n,
      oldUrl: 'https://old-url.example.com',
      newUrl: 'https://new-url.example.com',
    })

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'dir.url'))
    expect(rows[0].url).toBe('https://new-url.example.com')
  })
})

// ── handleDirectoryTransfer ──────────────────────────────────────────

describe('handleDirectoryTransfer', () => {
  it('updates operatorWallet to the new owner on ERC-721 transfer', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, token_id, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_xfer_1',
        'dir.xfer',
        'https://xfer.example.com',
        OPERATOR.toLowerCase(),
        'L1',
        'active',
        CHAIN,
        50,
        now,
        now
      )
      .run()

    const newOperator = '0x1111111111111111111111111111111111111111'
    await handleDirectoryTransfer(db, { from: OPERATOR, to: newOperator, tokenId: 50n })

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'dir.xfer'))
    expect(rows[0].operatorWallet).toBe(newOperator.toLowerCase())
  })

  it('lowercases the new operator wallet address', async () => {
    const now = new Date().toISOString()
    await mockDb
      .prepare(
        'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, token_id, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        'dir_xfer_2',
        'dir.xfer2',
        'https://xfer2.example.com',
        OPERATOR.toLowerCase(),
        'L1',
        'active',
        CHAIN,
        51,
        now,
        now
      )
      .run()

    const newOperatorMixed = '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333'
    await handleDirectoryTransfer(db, { from: OPERATOR, to: newOperatorMixed, tokenId: 51n })

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'dir.xfer2'))
    expect(rows[0].operatorWallet).toBe(newOperatorMixed.toLowerCase())
  })
})
