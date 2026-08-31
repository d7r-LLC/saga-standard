// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We mock node:child_process before importing the module so the spy
// captures every execFileSync call from inside resolveSecretsFromHostOp.
const execFileSync = vi.fn<(...args: unknown[]) => Buffer | string>()
vi.mock('node:child_process', () => ({ execFileSync }))

// Dynamic import after the mock is registered.
const { isHostOpAvailable, resolveSecretsFromHostOp } = await import('../deploy-secrets')

describe('deploy-secrets', () => {
  beforeEach(() => {
    execFileSync.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('resolveSecretsFromHostOp', () => {
    it('reads signer + explorer key + optional derivation_path via op CLI', () => {
      execFileSync
        .mockReturnValueOnce(
          'twelve word mnemonic seed phrase here zero alpha bravo charlie delta echo\n'
        )
        .mockReturnValueOnce('basescan-api-key-value\n')
        .mockReturnValueOnce("m/44'/60'/0'/0/3\n")

      const result = resolveSecretsFromHostOp({
        vault: 'saga-prod',
        signerItem: 'base-signer',
        signerField: 'mnemonic',
        explorerKeyItem: 'basescan-api-key',
      })

      expect(result.signer.split(/\s+/).length).toBe(12)
      expect(result.explorerKey).toBe('basescan-api-key-value')
      expect(result.derivationPath).toBe("m/44'/60'/0'/0/3")
    })

    it('passes the configured signerField in the op:// URI', () => {
      execFileSync
        .mockReturnValueOnce('hex-key-value')
        .mockReturnValueOnce('explorer-key')
        .mockImplementationOnce(() => {
          throw new Error('no derivation_path')
        })

      resolveSecretsFromHostOp({
        vault: 'saga-prod',
        signerItem: 'base-signer',
        signerField: 'mnemonic',
        explorerKeyItem: 'basescan-api-key',
      })

      const firstCall = execFileSync.mock.calls[0]
      expect(firstCall[0]).toBe('op')
      expect((firstCall[1] as string[])[1]).toBe('op://saga-prod/base-signer/mnemonic')
    })

    it('defaults signerField to "password" when omitted', () => {
      execFileSync
        .mockReturnValueOnce('hex-key-value')
        .mockReturnValueOnce('explorer-key')
        .mockImplementationOnce(() => {
          throw new Error('no derivation_path')
        })

      resolveSecretsFromHostOp({
        vault: 'saga-prod',
        signerItem: 'base-signer',
        explorerKeyItem: 'basescan-api-key',
      })

      const firstCall = execFileSync.mock.calls[0]
      expect((firstCall[1] as string[])[1]).toBe('op://saga-prod/base-signer/password')
    })

    it('returns null derivationPath when the optional read fails', () => {
      execFileSync
        .mockReturnValueOnce('hex-key-value')
        .mockReturnValueOnce('explorer-key')
        .mockImplementationOnce(() => {
          throw new Error('field not found')
        })

      const result = resolveSecretsFromHostOp({
        vault: 'saga-prod',
        signerItem: 'base-signer',
        explorerKeyItem: 'basescan-api-key',
      })

      expect(result.derivationPath).toBeNull()
    })

    it('throws actionable error when signer read fails', () => {
      execFileSync.mockImplementationOnce(() => {
        throw new Error('not signed in')
      })

      expect(() =>
        resolveSecretsFromHostOp({
          vault: 'saga-prod',
          signerItem: 'base-signer',
          explorerKeyItem: 'basescan-api-key',
        })
      ).toThrow(/signer credential.*op:\/\/saga-prod\/base-signer\/password/)
    })

    it('throws when signer read returns empty string', () => {
      execFileSync.mockReturnValueOnce('')

      expect(() =>
        resolveSecretsFromHostOp({
          vault: 'saga-prod',
          signerItem: 'base-signer',
          explorerKeyItem: 'basescan-api-key',
        })
      ).toThrow(/empty signer credential/)
    })

    it('throws when explorer key read fails', () => {
      execFileSync.mockReturnValueOnce('hex-key-value').mockImplementationOnce(() => {
        throw new Error('item not found')
      })

      expect(() =>
        resolveSecretsFromHostOp({
          vault: 'saga-prod',
          signerItem: 'base-signer',
          explorerKeyItem: 'basescan-api-key',
        })
      ).toThrow(/explorer api key/)
    })
  })

  describe('isHostOpAvailable', () => {
    it('returns true when op vault list succeeds', () => {
      execFileSync.mockReturnValueOnce('[]')
      expect(isHostOpAvailable()).toBe(true)
    })

    it('returns false when op vault list throws', () => {
      execFileSync.mockImplementationOnce(() => {
        throw new Error('command not found')
      })
      expect(isHostOpAvailable()).toBe(false)
    })
  })
})
