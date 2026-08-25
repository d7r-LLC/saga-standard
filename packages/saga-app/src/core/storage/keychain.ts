// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import * as Keychain from 'react-native-keychain'

const SERVICE_PREFIX = 'io.d7r.saga'

export const SecureKeychain = {
  async set(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: `${SERVICE_PREFIX}.${key}`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  },

  async get(key: string): Promise<string | null> {
    const result = await Keychain.getGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    })
    if (result === false) return null
    return result.password
  },

  async remove(key: string): Promise<void> {
    await Keychain.resetGenericPassword({
      service: `${SERVICE_PREFIX}.${key}`,
    })
  },

  async has(key: string): Promise<boolean> {
    const result = await this.get(key)
    return result !== null
  },
}
