// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
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
