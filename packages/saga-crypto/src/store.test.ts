// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'
import { MemoryBackend, createEncryptedStore } from './store'
import type { StorageBackend } from './types'

describe('MemoryBackend', () => {
  let backend: StorageBackend

  beforeEach(() => {
    backend = new MemoryBackend()
  })

  it('put + get round-trips', async () => {
    const data = new Uint8Array([1, 2, 3])
    await backend.put('key1', data)
    const result = await backend.get('key1')
    expect(result).toEqual(data)
  })

  it('get returns null for missing key', async () => {
    expect(await backend.get('missing')).toBeNull()
  })

  it('delete removes key', async () => {
    await backend.put('key1', new Uint8Array([1]))
    await backend.delete('key1')
    expect(await backend.get('key1')).toBeNull()
  })

  it('list returns all keys', async () => {
    await backend.put('a:1', new Uint8Array([1]))
    await backend.put('a:2', new Uint8Array([2]))
    await backend.put('b:1', new Uint8Array([3]))
    const all = await backend.list()
    expect(all.sort()).toEqual(['a:1', 'a:2', 'b:1'])
  })

  it('list with prefix filters keys', async () => {
    await backend.put('mem:1', new Uint8Array([1]))
    await backend.put('mem:2', new Uint8Array([2]))
    await backend.put('msg:1', new Uint8Array([3]))
    const filtered = await backend.list('mem:')
    expect(filtered.sort()).toEqual(['mem:1', 'mem:2'])
  })
})

describe('EncryptedStore', () => {
  const walletKey = nacl.randomBytes(32)

  async function createStore() {
    const kr = createSagaKeyRing()
    await kr.unlockWallet(walletKey)
    const backend = new MemoryBackend()
    return { store: createEncryptedStore(kr, backend), backend, kr }
  }

  it('put + get round-trips JSON values', async () => {
    const { store } = await createStore()
    await store.put('agent:mem:1', { type: 'episodic', content: 'learned TypeScript' })
    const result = await store.get('agent:mem:1')
    expect(result).toEqual({ type: 'episodic', content: 'learned TypeScript' })
  })

  it('get returns null for missing key', async () => {
    const { store } = await createStore()
    expect(await store.get('missing')).toBeNull()
  })

  it('stored data is encrypted in backend', async () => {
    const { store, backend } = await createStore()
    await store.put('key1', { secret: 'plaintext' })
    const raw = await backend.get('key1')
    expect(raw).not.toBeNull()
    // Raw bytes should not contain the plaintext string
    const rawStr = new TextDecoder().decode(raw!)
    expect(rawStr).not.toContain('plaintext')
  })

  it('delete removes from backend', async () => {
    const { store, backend } = await createStore()
    await store.put('key1', { data: 1 })
    await store.delete('key1')
    expect(await backend.get('key1')).toBeNull()
    expect(await store.get('key1')).toBeNull()
  })

  it('query returns matching entries', async () => {
    const { store } = await createStore()
    await store.put('mem:1', { id: 1 })
    await store.put('mem:2', { id: 2 })
    await store.put('msg:1', { id: 3 })
    const results = await store.query({ prefix: 'mem:' })
    expect(results).toHaveLength(2)
    expect(results.map(r => r.value)).toEqual(expect.arrayContaining([{ id: 1 }, { id: 2 }]))
  })

  it('different wallet cannot read stored data', async () => {
    const { store, backend } = await createStore()
    await store.put('key1', { secret: 'data' })

    const otherKr = createSagaKeyRing()
    await otherKr.unlockWallet(nacl.randomBytes(32))
    const otherStore = createEncryptedStore(otherKr, backend)

    await expect(otherStore.get('key1')).rejects.toThrow()
  })
})
