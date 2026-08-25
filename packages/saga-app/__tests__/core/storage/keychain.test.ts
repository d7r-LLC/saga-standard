// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import * as Keychain from 'react-native-keychain'
import { SecureKeychain } from '../../../src/core/storage/keychain'

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue({ password: 'test-value' }),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly' },
  SECURITY_LEVEL: { SECURE_HARDWARE: 'SECURE_HARDWARE' },
}))

const MockedKeychain = jest.mocked(Keychain)

describe('SecureKeychain', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('stores a value in the keychain', async () => {
    await SecureKeychain.set('master-key', 'secret-value')
    expect(MockedKeychain.setGenericPassword).toHaveBeenCalledWith(
      'master-key',
      'secret-value',
      expect.objectContaining({ service: 'io.d7r.saga.master-key' })
    )
  })

  it('retrieves a value from the keychain', async () => {
    const result = await SecureKeychain.get('master-key')
    expect(result).toBe('test-value')
  })

  it('returns null when no value exists', async () => {
    MockedKeychain.getGenericPassword.mockResolvedValueOnce(false)
    const result = await SecureKeychain.get('nonexistent')
    expect(result).toBeNull()
  })

  it('deletes a value from the keychain', async () => {
    await SecureKeychain.remove('master-key')
    expect(MockedKeychain.resetGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'io.d7r.saga.master-key' })
    )
  })
})
