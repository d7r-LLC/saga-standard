// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi } from 'vitest'
import { chainFromCaip2, getRpcUrl, waitForIndexer } from '../cli-chain-helpers'
import { SagaAuthError, SagaServerClient } from '@epicdm/saga-client'
import type { ResolveResponse } from '@epicdm/saga-client'

// ── getRpcUrl ────────────────────────────────────────────────────────

describe('getRpcUrl', () => {
  it('returns Base Sepolia RPC URL', () => {
    expect(getRpcUrl('base-sepolia')).toBe('https://sepolia.base.org')
  })

  it('returns Base mainnet RPC URL', () => {
    expect(getRpcUrl('base')).toBe('https://mainnet.base.org')
  })
})

// ── chainFromCaip2 ──────────────────────────────────────────────────

describe('chainFromCaip2', () => {
  it('maps eip155:84532 to base-sepolia', () => {
    expect(chainFromCaip2('eip155:84532')).toBe('base-sepolia')
  })

  it('maps eip155:8453 to base', () => {
    expect(chainFromCaip2('eip155:8453')).toBe('base')
  })

  it('defaults to base-sepolia for unknown chain IDs', () => {
    expect(chainFromCaip2('eip155:1')).toBe('base-sepolia')
  })
})

// ── waitForIndexer ──────────────────────────────────────────────────

describe('waitForIndexer', () => {
  const mockResolveResponse: ResolveResponse = {
    entityType: 'agent',
    handle: 'test.agent',
    walletAddress: '0xaabb',
    chain: 'eip155:84532',
    tokenId: 42,
    registeredAt: '2026-03-23T10:00:00Z',
  }

  it('resolves immediately when handle is found on first attempt', async () => {
    const client = {
      resolve: vi.fn().mockResolvedValue(mockResolveResponse),
    } as unknown as SagaServerClient

    const result = await waitForIndexer({
      client,
      handle: 'test.agent',
      maxAttempts: 3,
      intervalMs: 10,
    })

    expect(result).toEqual(mockResolveResponse)
    expect(client.resolve).toHaveBeenCalledTimes(1)
  })

  it('retries on 404 and resolves when handle appears', async () => {
    const notFoundError = new SagaAuthError('Not found', 'NOT_FOUND', 404)
    const client = {
      resolve: vi
        .fn()
        .mockRejectedValueOnce(notFoundError)
        .mockRejectedValueOnce(notFoundError)
        .mockResolvedValueOnce(mockResolveResponse),
    } as unknown as SagaServerClient

    const result = await waitForIndexer({
      client,
      handle: 'test.agent',
      maxAttempts: 5,
      intervalMs: 10,
    })

    expect(result).toEqual(mockResolveResponse)
    expect(client.resolve).toHaveBeenCalledTimes(3)
  })

  it('throws after max attempts when handle never appears', async () => {
    const notFoundError = new SagaAuthError('Not found', 'NOT_FOUND', 404)
    const client = {
      resolve: vi.fn().mockRejectedValue(notFoundError),
    } as unknown as SagaServerClient

    await expect(
      waitForIndexer({
        client,
        handle: 'never.found',
        maxAttempts: 3,
        intervalMs: 10,
      })
    ).rejects.toThrow('Indexer did not pick up handle "never.found"')
  })

  it('propagates non-404 errors immediately', async () => {
    const serverError = new SagaAuthError('Internal error', 'INTERNAL_ERROR', 500)
    const client = {
      resolve: vi.fn().mockRejectedValue(serverError),
    } as unknown as SagaServerClient

    await expect(
      waitForIndexer({
        client,
        handle: 'test.agent',
        maxAttempts: 5,
        intervalMs: 10,
      })
    ).rejects.toThrow('Internal error')

    // Should not retry on 500 errors
    expect(client.resolve).toHaveBeenCalledTimes(1)
  })
})
