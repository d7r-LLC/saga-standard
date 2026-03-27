// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ChainId, WalletData, WalletType } from '../types'

export interface WalletConstructorParams {
  id: string
  type: WalletType
  label: string
  address: `0x${string}`
  chain: ChainId
}

export abstract class AbstractWallet {
  readonly id: string
  readonly type: WalletType
  label: string
  readonly address: `0x${string}`
  readonly chain: ChainId
  balance: string
  lastSync: number

  constructor(params: WalletConstructorParams) {
    this.id = params.id
    this.type = params.type
    this.label = params.label
    this.address = params.address
    this.chain = params.chain
    this.balance = '0'
    this.lastSync = 0
  }

  getAddress(): `0x${string}` {
    return this.address
  }

  abstract signMessage(message: string): Promise<string>
  abstract signTransaction(tx: Record<string, unknown>): Promise<string>

  toJSON(): WalletData {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      address: this.address,
      chain: this.chain,
      balance: this.balance,
      lastSync: this.lastSync,
    }
  }
}
