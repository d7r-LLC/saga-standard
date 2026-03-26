// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { createMockKV } from './test-helpers'
import { createMailbox } from '../relay/mailbox'
import type { RelayMailbox } from '../relay/mailbox'
import type { RelayEnvelope } from '../relay/types'

function makeEnvelope(overrides: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    v: 1,
    type: 'direct-message',
    scope: 'mutual',
    from: 'alice@epicflow',
    to: 'bob@epicflow',
    ct: 'ciphertext',
    ts: new Date().toISOString(),
    id: crypto.randomUUID(),
    ...overrides,
  }
}

describe('createMailbox', () => {
  let kv: KVNamespace
  let mailbox: RelayMailbox

  beforeEach(() => {
    kv = createMockKV()
    mailbox = createMailbox(kv)
  })

  it('stores and drains an envelope', async () => {
    const env = makeEnvelope()
    await mailbox.store('bob', env)

    const { envelopes, remaining } = await mailbox.drain('bob')
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].id).toBe(env.id)
    expect(remaining).toBe(0)
  })

  it('drains in timestamp order', async () => {
    const env1 = makeEnvelope({ ts: '2026-03-26T00:00:01.000Z', id: 'msg-1' })
    const env2 = makeEnvelope({ ts: '2026-03-26T00:00:03.000Z', id: 'msg-3' })
    const env3 = makeEnvelope({ ts: '2026-03-26T00:00:02.000Z', id: 'msg-2' })

    // Store out of order
    await mailbox.store('bob', env2)
    await mailbox.store('bob', env1)
    await mailbox.store('bob', env3)

    const { envelopes } = await mailbox.drain('bob')
    expect(envelopes).toHaveLength(3)
    expect(envelopes[0].id).toBe('msg-1')
    expect(envelopes[1].id).toBe('msg-2')
    expect(envelopes[2].id).toBe('msg-3')
  })

  it('returns empty drain for unknown handle', async () => {
    const { envelopes, remaining } = await mailbox.drain('unknown')
    expect(envelopes).toHaveLength(0)
    expect(remaining).toBe(0)
  })

  it('isolates mailboxes per handle', async () => {
    await mailbox.store('bob', makeEnvelope({ id: 'for-bob' }))
    await mailbox.store('charlie', makeEnvelope({ id: 'for-charlie' }))

    const bob = await mailbox.drain('bob')
    expect(bob.envelopes).toHaveLength(1)
    expect(bob.envelopes[0].id).toBe('for-bob')

    const charlie = await mailbox.drain('charlie')
    expect(charlie.envelopes).toHaveLength(1)
    expect(charlie.envelopes[0].id).toBe('for-charlie')
  })

  it('ack removes delivered messages', async () => {
    const env1 = makeEnvelope({ id: 'msg-a' })
    const env2 = makeEnvelope({ id: 'msg-b' })
    await mailbox.store('bob', env1)
    await mailbox.store('bob', env2)

    await mailbox.ack('bob', ['msg-a'])

    const { envelopes } = await mailbox.drain('bob')
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].id).toBe('msg-b')
  })

  it('count returns pending message count', async () => {
    expect(await mailbox.count('bob')).toBe(0)
    await mailbox.store('bob', makeEnvelope())
    await mailbox.store('bob', makeEnvelope())
    expect(await mailbox.count('bob')).toBe(2)
  })
})
