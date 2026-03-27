// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = '@saga:'

export const AppStorage = {
  async get<T = string>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(`${PREFIX}${key}`)
    if (value === null) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return value as unknown as T
    }
  },

  async set(key: string, value: unknown): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    await AsyncStorage.setItem(`${PREFIX}${key}`, serialized)
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(`${PREFIX}${key}`)
  },

  async has(key: string): Promise<boolean> {
    const value = await AsyncStorage.getItem(`${PREFIX}${key}`)
    return value !== null
  },

  async clear(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys()
    const sagaKeys = keys.filter(k => k.startsWith(PREFIX))
    await AsyncStorage.removeMany(sagaKeys)
  },
}
