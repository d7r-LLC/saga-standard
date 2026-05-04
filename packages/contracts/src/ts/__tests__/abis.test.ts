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

  // Phase 9 (G-16): ABI freshness pin. The generator
  // (scripts/generate-abis.mjs) reads from out/<Contract>.sol/<Contract>.json
  // and writes the TS exports below. If a future Solidity change adds a
  // function but the generator isn't re-run, these explicit fingerprint
  // checks fail loudly instead of letting stale ABIs ship to consumers.
  // Touch this list whenever you remove or rename a public function.
  const fns = (abi: readonly { type: string; name?: string }[]) =>
    new Set(abi.filter(e => e.type === 'function').map(e => e.name))

  it('SAGAHandleRegistry ABI is fresh against post-Phase-9 surface', () => {
    const names = fns(SAGAHandleRegistryAbi)
    for (const expected of [
      'acceptOwnership',
      'pendingOwner',
      'transferOwnership',
      'renounceOwnership',
      'registerHandle',
      'registerScopedHandle',
      'resolveHandle',
      'resolveScopedHandle',
      'resolveActiveScopedHandle',
      'setAuthorizedContract',
      'setTrustedDirectoryContract',
      'trustedDirectoryContracts',
    ]) {
      expect(names, `missing ${expected}`).toContain(expected)
    }
  })

  it('SAGAAgentIdentity ABI is fresh against post-Phase-9 surface', () => {
    const names = fns(SAGAAgentIdentityAbi)
    for (const expected of [
      'acceptOwnership',
      'pendingOwner',
      'registerAgent',
      'registerAgentInDirectory',
      'setBaseURI',
      'applyBaseURI',
      'pendingBaseURI',
      'pendingBaseURIReadyAt',
      'BASE_URI_TIMELOCK',
    ]) {
      expect(names, `missing ${expected}`).toContain(expected)
    }
  })

  it('SAGAOrgIdentity ABI is fresh against post-Phase-9 surface', () => {
    const names = fns(SAGAOrgIdentityAbi)
    for (const expected of [
      'acceptOwnership',
      'pendingOwner',
      'registerOrganization',
      'registerOrgInDirectory',
      'setBaseURI',
      'applyBaseURI',
      'pendingBaseURI',
      'pendingBaseURIReadyAt',
      'BASE_URI_TIMELOCK',
    ]) {
      expect(names, `missing ${expected}`).toContain(expected)
    }
  })

  it('SAGADirectoryIdentity ABI is fresh against post-Phase-9 surface', () => {
    const names = fns(SAGADirectoryIdentityAbi)
    for (const expected of [
      'acceptOwnership',
      'pendingOwner',
      'registerDirectory',
      'updateDirectoryStatus',
      'updateDirectoryUrl',
      'directoryStatus',
      'setBaseURI',
      'applyBaseURI',
      'pendingBaseURI',
      'pendingBaseURIReadyAt',
      'BASE_URI_TIMELOCK',
    ]) {
      expect(names, `missing ${expected}`).toContain(expected)
    }
  })
})
