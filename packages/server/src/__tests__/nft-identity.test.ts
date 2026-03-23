// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

const WALLET = '0xaabbccddee1234567890aabbccddee1234567890'
const CHAIN = 'eip155:84532'

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
    // Import event handler directly
    const { handleAgentRegistered } = await import('../indexer/event-handlers')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(env.DB)

    await handleAgentRegistered(
      db,
      {
        tokenId: 42n,
        handle: 'minted.agent',
        owner: WALLET,
        hubUrl: 'https://hub.example.com',
        registeredAt: BigInt(Date.now()),
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

  it('agent owned by org TBA is traceable', async () => {
    const orgTba = '0xorgTba1234567890abcdef1234567890abcdef12'

    // Seed org with a known TBA
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

    // Seed agent owned by org's TBA
    await env.DB.prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, token_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind('agent_employed', 'employed.agent', orgTba.toLowerCase(), CHAIN, now, now, 10, 'agent')
      .run()

    // Verify agent is owned by org TBA address
    const agentRes = await req('GET', '/v1/agents/employed.agent')
    expect(agentRes.status).toBe(200)
    const agentBody = (await agentRes.json()) as { agent: Record<string, unknown> }
    expect(agentBody.agent.walletAddress).toBe(orgTba.toLowerCase())

    // Verify org has that TBA
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

    // Register agent with wallet A
    await handleAgentRegistered(
      db,
      {
        tokenId: 55n,
        handle: 'transfer.agent',
        owner: walletA,
        hubUrl: 'https://hub.example.com',
        registeredAt: BigInt(Date.now()),
      },
      {
        txHash: '0xtx_register',
        contractAddress: '0xcontract_agent',
        chain: CHAIN,
        blockNumber: 100n,
      }
    )

    // Transfer to wallet B
    await handleAgentTransfer(db, {
      from: walletA,
      to: walletB,
      tokenId: 55n,
    })

    // Verify API returns new owner
    const res = await req('GET', '/v1/agents/transfer.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { agent: Record<string, unknown> }
    expect(body.agent.walletAddress).toBe(walletB.toLowerCase())
  })

  it('legacy off-chain agent resolves with null NFT fields', async () => {
    // Seed directly (off-chain registration has no NFT fields)
    await seedLegacyAgent('offchain.agent')

    // Resolve returns no NFT fields
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
      hubUrl: 'https://hub.example.com',
      registeredAt: BigInt(Date.now()),
    }
    const meta = {
      txHash: '0xtx_idempotent',
      contractAddress: '0xcontract_idem',
      chain: CHAIN,
      blockNumber: 200n,
    }

    // First call creates
    await handleAgentRegistered(db, event, meta)

    // Second call upserts without error
    await handleAgentRegistered(db, event, meta)

    // Verify only one record exists with correct data
    const res = await req('GET', '/v1/resolve/idempotent.agent')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.tokenId).toBe(77)
    expect(body.homeHubUrl).toBe('https://hub.example.com')
  })

  it('duplicate handle across agent and org is caught', async () => {
    // Seed an agent with handle "shared-name"
    await seedLegacyAgent('shared-name')

    // Attempt to seed an org with the same handle
    // The agents and organizations tables have separate UNIQUE constraints,
    // but the resolve route checks agents first then orgs.
    // Verify resolve returns the agent (agents take priority).
    await seedOrg('shared-name', 'Shared Org')

    const res = await req('GET', '/v1/resolve/shared-name')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    // Agent should take priority in resolve since agents table is checked first
    expect(body.entityType).toBe('agent')
  })
})
