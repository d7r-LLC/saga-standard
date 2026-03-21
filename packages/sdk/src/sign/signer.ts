// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import type { ChainId } from '../types/common'
import type { ConsentMessage, SagaDocument, SignedSagaDocument } from '../types/saga-document'
import { canonicalize } from './canonicalize'

/** Signer interface for signing SAGA documents and consent messages */
export interface SagaSigner {
  sign(document: SagaDocument): Promise<SignedSagaDocument>
  signConsent(consent: ConsentMessage): Promise<string>
  getAddress(): Promise<string>
  getChain(): ChainId
}

/**
 * Create a signer from a raw private key (hex string).
 * For use in local keystore flow after decryption.
 */
export function createPrivateKeySigner(options: {
  privateKey: `0x${string}`
  chain?: ChainId
}): SagaSigner {
  const chain = options.chain ?? 'eip155:8453'
  const account = privateKeyToAccount(options.privateKey)
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(),
  })

  return {
    async sign(document: SagaDocument): Promise<SignedSagaDocument> {
      const message = buildSignMessage(document.documentId, document.exportedAt)
      const sig = await client.signMessage({ message })

      return {
        ...document,
        signature: {
          walletAddress: account.address,
          chain,
          message,
          sig,
        },
      }
    },

    async signConsent(consent: ConsentMessage): Promise<string> {
      const message = buildConsentMessage(consent)
      return client.signMessage({ message })
    },

    async getAddress(): Promise<string> {
      return account.address
    },

    getChain(): ChainId {
      return chain
    },
  }
}

/**
 * Create a signer that delegates to a remote identity service.
 * The service must implement a /api/saga/sign endpoint.
 */
export function createRemoteSigner(options: {
  identityServiceUrl: string
  sessionToken: string
  chain?: ChainId
}): SagaSigner {
  const chain = options.chain ?? 'eip155:8453'
  const baseUrl = options.identityServiceUrl.replace(/\/$/, '')

  async function remoteSign(message: string): Promise<{ sig: string; address: string }> {
    const res = await fetch(`${baseUrl}/api/saga/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.sessionToken}`,
      },
      body: JSON.stringify({ message }),
    })
    if (!res.ok) {
      throw new Error(`Remote signing failed: ${res.status} ${res.statusText}`)
    }
    return res.json() as Promise<{ sig: string; address: string }>
  }

  return {
    async sign(document: SagaDocument): Promise<SignedSagaDocument> {
      const message = buildSignMessage(document.documentId, document.exportedAt)
      const { sig, address } = await remoteSign(message)
      return {
        ...document,
        signature: {
          walletAddress: address,
          chain,
          message,
          sig,
        },
      }
    },

    async signConsent(consent: ConsentMessage): Promise<string> {
      const message = buildConsentMessage(consent)
      const { sig } = await remoteSign(message)
      return sig
    },

    async getAddress(): Promise<string> {
      const { address } = await remoteSign('address-probe')
      return address
    },

    getChain(): ChainId {
      return chain
    },
  }
}

/** Build the standard SAGA sign message per Section 15.1 */
function buildSignMessage(documentId: string, exportedAt: string): string {
  return `SAGA export ${documentId} at ${exportedAt}`
}

/** Build consent message per Section 15.2 */
function buildConsentMessage(consent: ConsentMessage): string {
  return canonicalize(consent)
}
