// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

const WALLET = '0xaabbccddee1234567890aabbccddee1234567890'
const CHAIN = 'eip155:84532'

/** Current time as seconds since epoch (matches Solidity block.timestamp) */
const NOW_SECONDS = BigInt(Math.floor(Date.now() / 1000))

let env: Env

async function req(
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string> }
): Promise<Response> {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = { ...opts?.headers }
  const init: RequestInit = { method, headers }

  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }

  return app.request(url, init, env)
}

/** Seed a legacy agent (no NFT fields) directly via D1 */
async function seedLegacyAgent(handle: string, wallet = WALLET): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(`agent_${handle}`, handle, wallet.toLowerCase(), CHAIN, now, now)
    .run()
}

/** Seed an agent with NFT fields directly via D1 */
async function seedNFTAgent(handle: string, tokenId: number, wallet = WALLET): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, token_id, tba_address, contract_address, mint_tx_hash, entity_type, home_hub_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      `agent_nft_${tokenId}`,
      handle,
      wallet.toLowerCase(),
      CHAIN,
      now,
      now,
      tokenId,
      '0xtba1234567890abcdef1234567890abcdef1234',
      '0xcontract1234567890abcdef1234567890abcdef',
      '0xtxhash1234567890abcdef1234567890abcdef12',
      'agent',
      'https://agents.epicflowstate.ai'
    )
    .run()
}

/** Seed an org directly via D1 */
async function seedOrg(handle: string, name: string, wallet = WALLET): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    'INSERT INTO organizations (id, handle, name, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(`org_${handle}`, handle, name, wallet.toLowerCase(), CHAIN, now, now)
    .run()
}

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

describe('resolve route', () => {
  it('resolves an existing agent', async () => {
    await seedLegacyAgent('marcus.chen')
    const res = await req('GET', '/v1/resolve/marcus.chen')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('marcus.chen')
  })

  it('resolves an existing org', async () => {
    await seedOrg('d7r-llc', 'd7r LLC')
    const res = await req('GET', '/v1/resolve/d7r-llc')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('org')
    expect(body.handle).toBe('d7r-llc')
    expect(body.name).toBe('d7r LLC')
  })

  it('returns 404 for nonexistent handle', async () => {
    const res = await req('GET', '/v1/resolve/nonexistent')
    expect(res.status).toBe(404)
  })

  it('returns NFT fields for on-chain agent', async () => {
    await seedNFTAgent('on-chain.agent', 42)
    const res = await req('GET', '/v1/resolve/on-chain.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.tokenId).toBe(42)
    expect(body.tbaAddress).toBeTruthy()
    expect(body.contractAddress).toBeTruthy()
  })
})

describe('org routes', () => {
  it('lists organizations with pagination', async () => {
    await seedOrg('d7r-llc', 'd7r LLC')
    await seedOrg('flowstate-labs', 'FlowState Labs')

    const res = await req('GET', '/v1/orgs')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { organizations: unknown[]; total: number }
    expect(body.organizations).toHaveLength(2)
    expect(body.total).toBe(2)
  })

  it('gets org by handle', async () => {
    await seedOrg('d7r-llc', 'd7r LLC')

    const res = await req('GET', '/v1/orgs/d7r-llc')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { organization: Record<string, unknown> }
    expect(body.organization.handle).toBe('d7r-llc')
    expect(body.organization.name).toBe('d7r LLC')
  })

  it('returns 404 for nonexistent org', async () => {
    const res = await req('GET', '/v1/orgs/nonexistent')
    expect(res.status).toBe(404)
  })

  it('includes mintTxHash in org list response', async () => {
    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO organizations (id, handle, name, wallet_address, chain, token_id, mint_tx_hash, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        'org_mint',
        'minted-org',
        'Minted Org',
        WALLET.toLowerCase(),
        CHAIN,
        5,
        '0xmint_tx_hash_for_org',
        now,
        now
      )
      .run()

    const res = await req('GET', '/v1/orgs')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { organizations: Record<string, unknown>[] }
    const org = body.organizations.find(o => o.handle === 'minted-org')
    expect(org).toBeTruthy()
    expect(org!.mintTxHash).toBe('0xmint_tx_hash_for_org')
  })
})

describe('agent routes — NFT fields', () => {
  it('returns null NFT fields for legacy agent', async () => {
    await seedLegacyAgent('legacy.agent')
    const res = await req('GET', '/v1/agents/legacy.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { agent: Record<string, unknown> }
    expect(body.agent.tokenId).toBeNull()
    expect(body.agent.tbaAddress).toBeNull()
    expect(body.agent.contractAddress).toBeNull()
    expect(body.agent.entityType).toBe('agent')
  })

  it('returns populated NFT fields for on-chain agent', async () => {
    await seedNFTAgent('nft.agent', 99)
    const res = await req('GET', '/v1/agents/nft.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { agent: Record<string, unknown> }
    expect(body.agent.tokenId).toBe(99)
    expect(body.agent.tbaAddress).toBeTruthy()
    expect(body.agent.contractAddress).toBeTruthy()
    expect(body.agent.homeHubUrl).toBe('https://agents.epicflowstate.ai')
  })

  it('includes NFT fields in list response', async () => {
    await seedNFTAgent('listed.agent', 7)
    const res = await req('GET', '/v1/agents')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { agents: Record<string, unknown>[] }
    expect(body.agents[0].tokenId).toBe(7)
    expect(body.agents[0].entityType).toBe('agent')
  })
})

// ── Integration scenarios ─────────────────────────────────────────

describe('integration — event handler → API', () => {
  it('agent registered event flows through to resolve API', async () => {
    const { handleAgentRegistered } = await import('../indexer/event-handlers')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(env.DB)

    await handleAgentRegistered(
      db,
      {
        tokenId: 42n,
        handle: 'minted.agent',
        owner: WALLET,
        homeHubUrl: 'https://hub.example.com',
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
        contractAddress: '0xcontract1234567890abcdef1234567890abcdef',
        chain: CHAIN,
        blockNumber: 12345n,
      }
    )

    const res = await req('GET', '/v1/resolve/minted.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('minted.agent')
    expect(body.tokenId).toBe(42)
    expect(body.contractAddress).toBe('0xcontract1234567890abcdef1234567890abcdef')
    expect(body.homeHubUrl).toBe('https://hub.example.com')
  })

  it('agent registered event stores computed TBA address', async () => {
    const { handleAgentRegistered } = await import('../indexer/event-handlers')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(env.DB)

    await handleAgentRegistered(
      db,
      {
        tokenId: 100n,
        handle: 'tba.agent',
        owner: WALLET,
        homeHubUrl: 'https://hub.example.com',
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx_tba_test',
        contractAddress: '0x1111111111111111111111111111111111111111',
        chain: CHAIN,
        blockNumber: 500n,
      }
    )

    const res = await req('GET', '/v1/resolve/tba.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.tbaAddress).toBeTruthy()
    expect(body.tbaAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('org registered event stores computed TBA address', async () => {
    const { handleOrgRegistered } = await import('../indexer/event-handlers')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(env.DB)

    await handleOrgRegistered(
      db,
      {
        tokenId: 200n,
        handle: 'tba-org',
        name: 'TBA Org',
        owner: WALLET,
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx_org_tba_test',
        contractAddress: '0x2222222222222222222222222222222222222222',
        chain: CHAIN,
        blockNumber: 501n,
      }
    )

    const res = await req('GET', '/v1/orgs/tba-org')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { organization: Record<string, unknown> }
    expect(body.organization.tbaAddress).toBeTruthy()
    expect(body.organization.tbaAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('agent owned by org TBA is traceable', async () => {
    const orgTba = '0xorgTba1234567890abcdef1234567890abcdef12'

    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO organizations (id, handle, name, wallet_address, chain, tba_address, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        'org_epic',
        'd7r-llc',
        'd7r LLC',
        WALLET.toLowerCase(),
        CHAIN,
        orgTba,
        now,
        now
      )
      .run()

    await env.DB.prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, token_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind('agent_employed', 'employed.agent', orgTba.toLowerCase(), CHAIN, now, now, 10, 'agent')
      .run()

    const agentRes = await req('GET', '/v1/agents/employed.agent')
    expect(agentRes.status).toBe(200)
    const agentBody = (await agentRes.json()) as { agent: Record<string, unknown> }
    expect(agentBody.agent.walletAddress).toBe(orgTba.toLowerCase())

    const orgRes = await req('GET', '/v1/orgs/d7r-llc')
    expect(orgRes.status).toBe(200)
    const orgBody = (await orgRes.json()) as { organization: Record<string, unknown> }
    expect(orgBody.organization.tbaAddress).toBe(orgTba)
  })

  it('agent transfer event updates owner in API', async () => {
    const { handleAgentRegistered, handleAgentTransfer } = await import('../indexer/event-handlers')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(env.DB)

    const walletA = '0xaaaa000000000000000000000000000000000001'
    const walletB = '0xbbbb000000000000000000000000000000000002'

    await handleAgentRegistered(
      db,
      {
        tokenId: 55n,
        handle: 'transfer.agent',
        owner: walletA,
        homeHubUrl: 'https://hub.example.com',
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx_register',
        contractAddress: '0xcontract_agent',
        chain: CHAIN,
        blockNumber: 100n,
      }
    )

    await handleAgentTransfer(db, {
      from: walletA,
      to: walletB,
      tokenId: 55n,
    })

    const res = await req('GET', '/v1/agents/transfer.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { agent: Record<string, unknown> }
    expect(body.agent.walletAddress).toBe(walletB.toLowerCase())
  })

  // Phase 5 (A-Med#11) — from-guard regression tests.
  // Use getDb (production factory) so test DB behavior matches runtime
  // (FK-enforced + schema-typed handle).
  it('stale Transfer A→C does NOT clobber row already at B', async () => {
    const { handleAgentRegistered, handleAgentTransfer } = await import('../indexer/event-handlers')
    const { getDb } = await import('../db')
    const db = getDb(env.DB)

    const walletA = '0xaaaa000000000000000000000000000000000a01'
    const walletB = '0xbbbb000000000000000000000000000000000b02'
    const walletC = '0xcccc000000000000000000000000000000000c03'

    await handleAgentRegistered(
      db,
      {
        tokenId: 555n,
        handle: 'guarded.agent',
        owner: walletA,
        homeHubUrl: 'https://hub.example.com',
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx_register_guarded',
        contractAddress: '0xcontract_guarded',
        chain: CHAIN,
        blockNumber: 1000n,
      }
    )

    // First Transfer A→B (legitimate, in-order)
    await handleAgentTransfer(db, { from: walletA, to: walletB, tokenId: 555n })

    // Stale/replayed Transfer A→C arriving AFTER state is already B.
    // Without the from-guard this would clobber the row to C; with it,
    // the WHERE clause matches zero rows and the update is a safe no-op.
    await handleAgentTransfer(db, { from: walletA, to: walletC, tokenId: 555n })

    const res = await req('GET', '/v1/agents/guarded.agent')
    const body = (await res.json()) as { agent: Record<string, unknown> }
    expect(body.agent.walletAddress).toBe(walletB.toLowerCase())
  })

  it('replayed Transfer with matching from is idempotent (still B)', async () => {
    const { handleAgentRegistered, handleAgentTransfer } = await import('../indexer/event-handlers')
    const { getDb } = await import('../db')
    const db = getDb(env.DB)

    const walletA = '0xaaaa000000000000000000000000000000000a04'
    const walletB = '0xbbbb000000000000000000000000000000000b05'

    await handleAgentRegistered(
      db,
      {
        tokenId: 556n,
        handle: 'replayed.agent',
        owner: walletA,
        homeHubUrl: 'https://hub.example.com',
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx_register_replayed',
        contractAddress: '0xcontract_replayed',
        chain: CHAIN,
        blockNumber: 1001n,
      }
    )

    // First A→B applies
    await handleAgentTransfer(db, { from: walletA, to: walletB, tokenId: 556n })
    // Replay of A→B (cursor reset, federation re-broadcast). On the second
    // call, current is already B, so the from-match (lower(walletAddress) == A)
    // fails and the UPDATE is a no-op. State stays at B.
    await handleAgentTransfer(db, { from: walletA, to: walletB, tokenId: 556n })

    const res = await req('GET', '/v1/agents/replayed.agent')
    const body = (await res.json()) as { agent: Record<string, unknown> }
    expect(body.agent.walletAddress).toBe(walletB.toLowerCase())
  })

  it('directory transfer from-guard rejects stale event', async () => {
    const { handleDirectoryRegistered, handleDirectoryTransfer } =
      await import('../indexer/event-handlers')
    const { getDb } = await import('../db')
    const db = getDb(env.DB)

    const walletA = '0xaaaa000000000000000000000000000000000d01'
    const walletB = '0xbbbb000000000000000000000000000000000d02'
    const walletC = '0xcccc000000000000000000000000000000000d03'

    await handleDirectoryRegistered(
      db,
      {
        tokenId: 9001n,
        directoryId: 'guarded-dir',
        url: 'https://dir.example.com',
        operator: walletA,
        conformanceLevel: 'standard',
        registeredAt: NOW_SECONDS,
      },
      {
        txHash: '0xtx_dir_register',
        contractAddress: '0xcontract_dir_guarded',
        chain: CHAIN,
        blockNumber: 1100n,
      }
    )

    // A→B applies; subsequent stale A→C is rejected by the from-guard.
    await handleDirectoryTransfer(db, { from: walletA, to: walletB, tokenId: 9001n })
    await handleDirectoryTransfer(db, { from: walletA, to: walletC, tokenId: 9001n })

    // Verify the row is at B, not C, by querying directly.
    const row = await env.DB.prepare(
      'SELECT operator_wallet FROM directories WHERE directory_id = ?'
    )
      .bind('guarded-dir')
      .first<{ operator_wallet: string }>()
    expect(row?.operator_wallet).toBe(walletB.toLowerCase())
  })

  it('legacy off-chain agent resolves with null NFT fields', async () => {
    await seedLegacyAgent('offchain.agent')

    const res = await req('GET', '/v1/resolve/offchain.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('offchain.agent')
    expect(body.tokenId).toBeNull()
    expect(body.tbaAddress).toBeNull()
  })

  it('event handler is idempotent on replay', async () => {
    const { handleAgentRegistered } = await import('../indexer/event-handlers')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(env.DB)

    const event = {
      tokenId: 77n,
      handle: 'idempotent.agent',
      owner: WALLET,
      homeHubUrl: 'https://hub.example.com',
      registeredAt: NOW_SECONDS,
    }
    const meta = {
      txHash: '0xtx_idempotent',
      contractAddress: '0xcontract_idem',
      chain: CHAIN,
      blockNumber: 200n,
    }

    await handleAgentRegistered(db, event, meta)
    await handleAgentRegistered(db, event, meta)

    const res = await req('GET', '/v1/resolve/idempotent.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.tokenId).toBe(77)
    expect(body.homeHubUrl).toBe('https://hub.example.com')
  })

  it('duplicate handle across agent and org is caught', async () => {
    await seedLegacyAgent('shared-name')
    await seedOrg('shared-name', 'Shared Org')

    const res = await req('GET', '/v1/resolve/shared-name')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
  })
})
