// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  type Address,
  type Hash,
  concat,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  pad,
} from 'viem'
import { ERC6551_REGISTRY } from './addresses'

const DEFAULT_SALT: Hash = '0x0000000000000000000000000000000000000000000000000000000000000000'

/**
 * Compute the ERC-6551 Token Bound Account address off-chain.
 *
 * Uses the same CREATE2 formula as the canonical ERC-6551 registry so the
 * returned address matches what `registry.account()` returns on-chain.
 *
 * @param options.salt - Must be a 32-byte (66-char) hex string. Defaults to zero.
 */
export function computeTBAAddress(options: {
  implementation: Address
  chainId: number
  tokenContract: Address
  tokenId: bigint
  salt?: Hash
}): Address {
  const { implementation, chainId, tokenContract, tokenId, salt = DEFAULT_SALT } = options

  if (salt.length !== 66) {
    throw new Error(`salt must be 32 bytes (66 hex chars), got ${salt.length} chars`)
  }

  // ABI-encoded context appended to the proxy bytecode
  const encodedData = encodeAbiParameters(
    [
      { type: 'bytes32', name: 'salt' },
      { type: 'uint256', name: 'chainId' },
      { type: 'address', name: 'tokenContract' },
      { type: 'uint256', name: 'tokenId' },
    ],
    [salt, BigInt(chainId), tokenContract, tokenId]
  )

  // ERC-6551 proxy creation code (ERC-1167 minimal proxy format)
  const creationCode = concat([
    '0x3d60ad80600a3d3981f3363d3d373d3d3d363d73',
    pad(implementation, { size: 20 }),
    '0x5af43d82803e903d91602b57fd5bf3',
    encodedData,
  ])

  return getCreate2Address({
    from: ERC6551_REGISTRY,
    salt,
    bytecodeHash: keccak256(creationCode),
  })
}
