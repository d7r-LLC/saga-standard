// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { SelfCustodyWallet } from '../../../../src/features/wallet/class/SelfCustodyWallet'
import { generateNewMnemonic } from '../../../../src/features/wallet/crypto/mnemonic'

describe('SelfCustodyWallet', () => {
  const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

  it('creates from a mnemonic', () => {
    const wallet = SelfCustodyWallet.fromMnemonic({
      id: 'w-1',
      label: 'Test Wallet',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    expect(wallet.type).toBe('self-custody')
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(wallet.derivationPath).toBe("m/44'/60'/0'/0/0")
  })

  it('derives a deterministic address from the same mnemonic', () => {
    const wallet1 = SelfCustodyWallet.fromMnemonic({
      id: 'w-1',
      label: 'W1',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    const wallet2 = SelfCustodyWallet.fromMnemonic({
      id: 'w-2',
      label: 'W2',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    expect(wallet1.address).toBe(wallet2.address)
  })

  it('derives different addresses from different mnemonics', () => {
    const mnemonic2 = generateNewMnemonic()
    const wallet1 = SelfCustodyWallet.fromMnemonic({
      id: 'w-1',
      label: 'W1',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    const wallet2 = SelfCustodyWallet.fromMnemonic({
      id: 'w-2',
      label: 'W2',
      chain: 'base-sepolia',
      mnemonic: mnemonic2,
    })
    expect(wallet1.address).not.toBe(wallet2.address)
  })

  it('signs a message', async () => {
    const wallet = SelfCustodyWallet.fromMnemonic({
      id: 'w-1',
      label: 'Test',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    const signature = await wallet.signMessage('hello world')
    expect(signature).toMatch(/^0x[0-9a-fA-F]+$/)
  })

  it('uses a custom derivation path', () => {
    const customPath = "m/44'/60'/0'/0/1"
    const wallet = SelfCustodyWallet.fromMnemonic({
      id: 'w-1',
      label: 'Custom',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
      derivationPath: customPath,
    })
    expect(wallet.derivationPath).toBe(customPath)
    const defaultWallet = SelfCustodyWallet.fromMnemonic({
      id: 'w-2',
      label: 'Default',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    expect(wallet.address).not.toBe(defaultWallet.address)
  })

  it('exports mnemonic', () => {
    const wallet = SelfCustodyWallet.fromMnemonic({
      id: 'w-1',
      label: 'Test',
      chain: 'base-sepolia',
      mnemonic: testMnemonic,
    })
    expect(wallet.exportMnemonic()).toBe(testMnemonic)
  })

  it('creates a new wallet with generated mnemonic', () => {
    const wallet = SelfCustodyWallet.createNew({
      id: 'w-new',
      label: 'New Wallet',
      chain: 'base-sepolia',
    })
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    const words = wallet.exportMnemonic().split(' ')
    expect(words).toHaveLength(12)
  })
})
