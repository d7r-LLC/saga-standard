// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { ManagedWallet } from '../../../../src/features/wallet/class/ManagedWallet'

describe('ManagedWallet', () => {
  it('constructs with managed type', () => {
    const wallet = new ManagedWallet({
      id: 'managed-1',
      label: 'Hub Wallet',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chain: 'base-sepolia',
      hubUrl: 'https://hub.example.com',
      managedId: 'tenant-123',
    })
    expect(wallet.type).toBe('managed')
    expect(wallet.hubUrl).toBe('https://hub.example.com')
    expect(wallet.managedId).toBe('tenant-123')
  })

  it('throws on signMessage without hub connection', async () => {
    const wallet = new ManagedWallet({
      id: 'managed-1',
      label: 'Hub Wallet',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chain: 'base-sepolia',
      hubUrl: 'https://hub.example.com',
      managedId: 'tenant-123',
    })
    await expect(wallet.signMessage('hello')).rejects.toThrow(
      'Hub connection required for managed wallet signing'
    )
  })

  it('throws on signTransaction without hub connection', async () => {
    const wallet = new ManagedWallet({
      id: 'managed-1',
      label: 'Hub Wallet',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chain: 'base-sepolia',
      hubUrl: 'https://hub.example.com',
      managedId: 'tenant-123',
    })
    await expect(wallet.signTransaction({ to: '0x0' })).rejects.toThrow(
      'Hub connection required for managed wallet signing'
    )
  })

  it('serializes to JSON with managed fields', () => {
    const wallet = new ManagedWallet({
      id: 'managed-1',
      label: 'Hub Wallet',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chain: 'base-sepolia',
      hubUrl: 'https://hub.example.com',
      managedId: 'tenant-123',
    })
    const json = wallet.toJSON()
    expect(json.type).toBe('managed')
    expect(json.id).toBe('managed-1')
  })
})
