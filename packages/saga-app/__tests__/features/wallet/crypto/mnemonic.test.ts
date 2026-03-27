// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  generateNewMnemonic,
  mnemonicToWords,
  validateMnemonicPhrase,
} from '../../../../src/features/wallet/crypto/mnemonic'

describe('mnemonic utilities', () => {
  it('generates a 12-word mnemonic by default', () => {
    const mnemonic = generateNewMnemonic()
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(12)
  })

  it('generates a 24-word mnemonic when requested', () => {
    const mnemonic = generateNewMnemonic(24)
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(24)
  })

  it('validates a correct mnemonic', () => {
    const mnemonic = generateNewMnemonic()
    expect(validateMnemonicPhrase(mnemonic)).toBe(true)
  })

  it('rejects an invalid mnemonic', () => {
    expect(validateMnemonicPhrase('invalid words here that are not a mnemonic')).toBe(false)
  })

  it('splits mnemonic into word array', () => {
    const mnemonic = generateNewMnemonic()
    const words = mnemonicToWords(mnemonic)
    expect(Array.isArray(words)).toBe(true)
    expect(words).toHaveLength(12)
    words.forEach(word => expect(typeof word).toBe('string'))
  })
})
