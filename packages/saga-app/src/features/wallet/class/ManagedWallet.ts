// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { AbstractWallet } from './AbstractWallet'
import type { ChainId } from '../types'

interface ManagedWalletParams {
  id: string
  label: string
  address: `0x${string}` | string
  chain: ChainId
  hubUrl: string
  managedId: string
}

export class ManagedWallet extends AbstractWallet {
  readonly hubUrl: string
  readonly managedId: string

  constructor(params: ManagedWalletParams) {
    super({
      id: params.id,
      type: 'managed',
      label: params.label,
      address: params.address as `0x${string}`,
      chain: params.chain,
    })
    this.hubUrl = params.hubUrl
    this.managedId = params.managedId
  }

  async signMessage(_message: string): Promise<string> {
    throw new Error('Hub connection required for managed wallet signing')
  }

  async signTransaction(_tx: Record<string, unknown>): Promise<string> {
    throw new Error('Hub connection required for managed wallet signing')
  }
}
