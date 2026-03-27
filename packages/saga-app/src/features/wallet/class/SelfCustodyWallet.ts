// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type HDAccount, mnemonicToAccount } from 'viem/accounts'
import { AbstractWallet } from './AbstractWallet'
import { generateNewMnemonic } from '../crypto/mnemonic'
import { DEFAULT_DERIVATION_PATH } from '../constants'
import type { ChainId } from '../types'

interface FromMnemonicParams {
  id: string
  label: string
  chain: ChainId
  mnemonic: string
  derivationPath?: string
}

interface CreateNewParams {
  id: string
  label: string
  chain: ChainId
  wordCount?: 12 | 24
}

export class SelfCustodyWallet extends AbstractWallet {
  readonly derivationPath: string
  private readonly mnemonic: string
  private readonly account: HDAccount

  private constructor(
    id: string,
    label: string,
    chain: ChainId,
    mnemonic: string,
    derivationPath: string,
    account: HDAccount
  ) {
    super({
      id,
      type: 'self-custody',
      label,
      address: account.address,
      chain,
    })
    this.mnemonic = mnemonic
    this.derivationPath = derivationPath
    this.account = account
  }

  static fromMnemonic(params: FromMnemonicParams): SelfCustodyWallet {
    const path = (params.derivationPath ?? DEFAULT_DERIVATION_PATH) as `m/44'/60'/${string}`
    const account = mnemonicToAccount(params.mnemonic, { path })
    return new SelfCustodyWallet(
      params.id,
      params.label,
      params.chain,
      params.mnemonic,
      path,
      account
    )
  }

  static createNew(params: CreateNewParams): SelfCustodyWallet {
    const mnemonic = generateNewMnemonic(params.wordCount ?? 12)
    return SelfCustodyWallet.fromMnemonic({
      id: params.id,
      label: params.label,
      chain: params.chain,
      mnemonic,
    })
  }

  exportMnemonic(): string {
    return this.mnemonic
  }

  async signMessage(message: string): Promise<string> {
    return this.account.signMessage({ message })
  }

  async signTransaction(tx: Record<string, unknown>): Promise<string> {
    return this.account.signTransaction(tx as any)
  }
}
