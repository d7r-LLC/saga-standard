// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { formatResolveResult } from '../commands/resolve'
import type { ResolveResponse } from '@d7r/saga-client'

describe('formatResolveResult', () => {
  it('formats agent resolve result with all fields', () => {
    const result: ResolveResponse = {
      entityType: 'agent',
      handle: 'marcus.chen',
      walletAddress: '0xaabb',
      chain: 'eip155:84532',
      tokenId: 42,
      tbaAddress: '0xtba42',
      homeHubUrl: 'https://hub.example.com',
      contractAddress: '0xcontract',
      mintTxHash: '0xtx123',
      registeredAt: '2026-03-23T10:00:00Z',
    }

    const output = formatResolveResult(result)

    expect(output).toContain('Entity Type: agent')
    expect(output).toContain('Handle:      marcus.chen')
    expect(output).toContain('Token ID:    42')
    expect(output).toContain('TBA Address: 0xtba42')
    expect(output).toContain('Home Hub:    https://hub.example.com')
    expect(output).toContain('Contract:    0xcontract')
    expect(output).toContain('Wallet:      0xaabb')
    expect(output).toContain('Chain:       eip155:84532')
  })

  it('formats org resolve result with name', () => {
    const result: ResolveResponse = {
      entityType: 'org',
      handle: 'd7r',
      walletAddress: '0xaabb',
      chain: 'eip155:84532',
      name: 'd7r LLC',
      registeredAt: '2026-03-23T10:00:00Z',
    }

    const output = formatResolveResult(result)

    expect(output).toContain('Entity Type: org')
    expect(output).toContain('Name:        d7r LLC')
    expect(output).not.toContain('Token ID:')
    expect(output).not.toContain('TBA Address:')
  })

  it('omits null fields from output', () => {
    const result: ResolveResponse = {
      entityType: 'agent',
      handle: 'legacy.agent',
      walletAddress: '0xaabb',
      chain: 'eip155:8453',
      tokenId: null,
      tbaAddress: null,
      homeHubUrl: null,
      registeredAt: '2026-03-23T10:00:00Z',
    }

    const output = formatResolveResult(result)

    expect(output).not.toContain('Token ID:')
    expect(output).not.toContain('TBA Address:')
    expect(output).not.toContain('Home Hub:')
  })
})
