// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { ERC6551_REGISTRY, getDeployedAddress, isDeployed } from '../addresses'

describe('addresses', () => {
  it('ERC6551_REGISTRY is the canonical address', () => {
    expect(ERC6551_REGISTRY).toBe('0x000000006551c19487814612e58FE06813775758')
  })

  it('getDeployedAddress throws for undeployed contracts', () => {
    expect(() => getDeployedAddress('SAGAHandleRegistry', 'base')).toThrow(
      'SAGAHandleRegistry not yet deployed on base'
    )
  })

  it('isDeployed returns false for undeployed contracts', () => {
    expect(isDeployed('SAGAHandleRegistry', 'base')).toBe(false)
  })

  it('getDeployedAddress throws for base-sepolia (not yet deployed)', () => {
    expect(() => getDeployedAddress('SAGAHandleRegistry', 'base-sepolia')).toThrow(
      'not yet deployed'
    )
  })
})
