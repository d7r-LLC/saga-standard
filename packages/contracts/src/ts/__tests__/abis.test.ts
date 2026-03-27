// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import {
  SAGAAgentIdentityAbi,
  SAGADirectoryIdentityAbi,
  SAGAHandleRegistryAbi,
  SAGAOrgIdentityAbi,
} from '../abis'

describe('ABI exports', () => {
  it('SAGAHandleRegistryAbi is a non-empty array', () => {
    expect(Array.isArray(SAGAHandleRegistryAbi)).toBe(true)
    expect(SAGAHandleRegistryAbi.length).toBeGreaterThan(0)
  })

  it('SAGAAgentIdentityAbi is a non-empty array', () => {
    expect(Array.isArray(SAGAAgentIdentityAbi)).toBe(true)
    expect(SAGAAgentIdentityAbi.length).toBeGreaterThan(0)
  })

  it('SAGAOrgIdentityAbi is a non-empty array', () => {
    expect(Array.isArray(SAGAOrgIdentityAbi)).toBe(true)
    expect(SAGAOrgIdentityAbi.length).toBeGreaterThan(0)
  })

  it('registry ABI contains registerHandle function', () => {
    const fn = SAGAHandleRegistryAbi.find(e => e.type === 'function' && e.name === 'registerHandle')
    expect(fn).toBeDefined()
  })

  it('agent ABI contains registerAgent function', () => {
    const fn = SAGAAgentIdentityAbi.find(e => e.type === 'function' && e.name === 'registerAgent')
    expect(fn).toBeDefined()
  })

  it('org ABI contains registerOrganization function', () => {
    const fn = SAGAOrgIdentityAbi.find(
      e => e.type === 'function' && e.name === 'registerOrganization'
    )
    expect(fn).toBeDefined()
  })

  it('SAGADirectoryIdentityAbi is a non-empty array', () => {
    expect(Array.isArray(SAGADirectoryIdentityAbi)).toBe(true)
    expect(SAGADirectoryIdentityAbi.length).toBeGreaterThan(0)
  })

  it('directory ABI contains registerDirectory function', () => {
    const fn = SAGADirectoryIdentityAbi.find(
      e => e.type === 'function' && e.name === 'registerDirectory'
    )
    expect(fn).toBeDefined()
  })
})
