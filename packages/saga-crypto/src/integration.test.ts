// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'
import { open, seal } from './envelope'
import { MemoryBackend, createEncryptedStore } from './store'
import type { SagaEncryptedEnvelope } from './types'

describe('integration: two-agent encrypted replication', () => {
  // Simulate two agents with different wallets
  const agentAliceWallet = nacl.randomBytes(32)
  const companyAcmeWallet = nacl.randomBytes(32)

  it('full flow: agent↔company mutual messaging via envelope', async () => {
    // 1. Both parties derive keys
    const aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(agentAliceWallet)
    const acmeKr = createSagaKeyRing()
    await acmeKr.unlockWallet(companyAcmeWallet)

    // 2. Alice sends a task result to Acme (mutual scope)
    const taskResult = new TextEncoder().encode(
      JSON.stringify({
        taskId: 'task-001',
        result: 'Analysis complete. Revenue up 15%.',
      })
    )

    const envelope = seal(
      {
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'acme-corp@epicflow',
        plaintext: taskResult,
        recipientPublicKey: acmeKr.getPublicKey(),
      },
      aliceKr
    ) as SagaEncryptedEnvelope

    // 3. Verify envelope is opaque to the hub
    expect(envelope.ct).not.toContain('Revenue')

    // 4. Acme decrypts
    const decrypted = open(envelope, acmeKr, aliceKr.getPublicKey()) as Uint8Array
    const parsed = JSON.parse(new TextDecoder().decode(decrypted))
    expect(parsed.taskId).toBe('task-001')
    expect(parsed.result).toContain('Revenue up 15%')
  })

  it('full flow: agent-private memory stored and synced', async () => {
    const aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(agentAliceWallet)

    // 1. Alice stores private memory locally
    const backend = new MemoryBackend()
    const store = createEncryptedStore(aliceKr, backend)

    const memory = {
      id: 'mem-001',
      type: 'semantic',
      content: 'TypeScript generics are covariant by default',
      createdAt: new Date().toISOString(),
    }
    await store.put(`mem:${memory.id}`, memory)

    // 2. Alice seals memory for sync (private scope)
    const envelope = (await seal(
      {
        type: 'memory-sync',
        scope: 'private',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        plaintext: new TextEncoder().encode(JSON.stringify(memory)),
      },
      aliceKr
    )) as SagaEncryptedEnvelope

    // 3. Envelope is opaque
    expect(envelope.ct).not.toContain('TypeScript')

    // 4. Alice opens it on another DERP (same wallet)
    const aliceKr2 = createSagaKeyRing()
    await aliceKr2.unlockWallet(agentAliceWallet)
    const decrypted = await open(envelope, aliceKr2)
    const parsed = JSON.parse(new TextDecoder().decode(decrypted as Uint8Array))
    expect(parsed.content).toContain('TypeScript generics')

    // 5. Acme cannot open it
    const acmeKr = createSagaKeyRing()
    await acmeKr.unlockWallet(companyAcmeWallet)
    await expect(open(envelope, acmeKr)).rejects.toThrow()
  })

  it('full flow: org group key distribution and group messaging', async () => {
    const aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(agentAliceWallet)
    const acmeKr = createSagaKeyRing()
    await acmeKr.unlockWallet(companyAcmeWallet)

    // 1. Acme creates an org group key
    const groupKeyId = 'acme-org-key-v1'
    const rawGroupKey = nacl.randomBytes(32)
    acmeKr.injectGroupKey(groupKeyId, rawGroupKey)
    rawGroupKey.fill(0)

    // 2. Acme distributes group key to Alice (NaCl box wrapped)
    const wrappedForAlice = acmeKr.wrapGroupKeyFor(groupKeyId, aliceKr.getPublicKey())
    aliceKr.addGroupKey(groupKeyId, wrappedForAlice, acmeKr.getPublicKey())

    // 3. Acme sends group broadcast
    const announcement = new TextEncoder().encode(
      JSON.stringify({
        messageType: 'notification',
        payload: 'All-hands meeting at 3pm',
      })
    )

    const envelope = await seal(
      {
        type: 'group-message',
        scope: 'group',
        from: 'acme-corp@epicflow',
        to: ['alice@epicflow', 'bob@epicflow'],
        plaintext: announcement,
        groupKeyId,
      },
      acmeKr
    )

    // 4. Alice decrypts
    const decrypted = await open(envelope as SagaEncryptedEnvelope, aliceKr)
    const parsed = JSON.parse(new TextDecoder().decode(decrypted as Uint8Array))
    expect(parsed.payload).toContain('All-hands meeting')
  })

  it('encrypted store: data survives lock/unlock cycle', async () => {
    const backend = new MemoryBackend()

    // Session 1: store data
    const kr1 = createSagaKeyRing()
    await kr1.unlockWallet(agentAliceWallet)
    const store1 = createEncryptedStore(kr1, backend)
    await store1.put('config', { theme: 'dark', lang: 'en' })
    kr1.lock()

    // Session 2: read data (same wallet, new KeyRing instance)
    const kr2 = createSagaKeyRing()
    await kr2.unlockWallet(agentAliceWallet)
    const store2 = createEncryptedStore(kr2, backend)
    const config = await store2.get<{ theme: string; lang: string }>('config')
    expect(config).toEqual({ theme: 'dark', lang: 'en' })
  })
})
