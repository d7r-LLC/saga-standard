// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { AbstractWallet } from '../../../../src/features/wallet/class/AbstractWallet'
import type { ChainId, WalletType } from '../../../../src/features/wallet/types'

class TestWallet extends AbstractWallet {
  async signMessage(_message: string): Promise<string> {
    return '0xsigned'
  }
  async signTransaction(_tx: Record<string, unknown>): Promise<string> {
    return '0xtxsigned'
  }
}

describe('AbstractWallet', () => {
  const params = {
    id: 'wallet-1',
    type: 'self-custody' as WalletType,
    label: 'My Wallet',
    address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    chain: 'base-sepolia' as ChainId,
  }

  it('constructs with required properties', () => {
    const wallet = new TestWallet(params)
    expect(wallet.id).toBe('wallet-1')
    expect(wallet.type).toBe('self-custody')
    expect(wallet.label).toBe('My Wallet')
    expect(wallet.address).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(wallet.chain).toBe('base-sepolia')
    expect(wallet.balance).toBe('0')
  })

  it('serializes to JSON', () => {
    const wallet = new TestWallet(params)
    wallet.balance = '1.5'
    const json = wallet.toJSON()
    expect(json).toEqual({
      id: 'wallet-1',
      type: 'self-custody',
      label: 'My Wallet',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      chain: 'base-sepolia',
      balance: '1.5',
      lastSync: 0,
    })
  })

  it('updates balance', () => {
    const wallet = new TestWallet(params)
    wallet.balance = '2.0'
    expect(wallet.balance).toBe('2.0')
  })

  it('calls abstract signMessage', async () => {
    const wallet = new TestWallet(params)
    const sig = await wallet.signMessage('hello')
    expect(sig).toBe('0xsigned')
  })

  it('calls abstract signTransaction', async () => {
    const wallet = new TestWallet(params)
    const sig = await wallet.signTransaction({ to: '0x0', value: '0' })
    expect(sig).toBe('0xtxsigned')
  })

  it('returns the correct address via getAddress', () => {
    const wallet = new TestWallet(params)
    expect(wallet.getAddress()).toBe('0x1234567890abcdef1234567890abcdef12345678')
  })
})
