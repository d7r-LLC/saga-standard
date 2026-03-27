// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

export function generateNewMnemonic(wordCount: 12 | 24 = 12): string {
  const strength = wordCount === 24 ? 256 : 128
  return generateMnemonic(wordlist, strength)
}

export function validateMnemonicPhrase(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist)
}

export function mnemonicToWords(mnemonic: string): string[] {
  return mnemonic.trim().split(/\s+/)
}
