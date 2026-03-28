// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Stub for @saga-standard/contracts — used in tests when the contracts package is not built.
// The contracts package requires a build step (tsup) that produces dist/index.js.
// In this worktree the dist is absent, so tests mock the one function the server uses.

export function computeTBAAddress(
  _implementationAddress: string,
  _chainId: number,
  _tokenContract: string,
  _tokenId: bigint
): string {
  return '0x0000000000000000000000000000000000000000'
}
