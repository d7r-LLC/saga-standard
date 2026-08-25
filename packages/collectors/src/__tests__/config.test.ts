// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSagaConfig } from '../config'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-config-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('loadSagaConfig', () => {
  it('loads config from .saga/config.json', () => {
    const sagaDir = join(tempDir, '.saga')
    mkdirSync(sagaDir, { recursive: true })
    writeFileSync(join(sagaDir, 'config.json'), JSON.stringify({
      agent: {
        sagaHandle: 'marcus-chen',
        sagaWallet: '0xabc123',
        chain: 'eip155:8453',
        orgHandle: 'd7r',
      },
      hub: {
        url: 'https://agents.d7r.io',
        systemId: 'flowstate-derp-marcus-01',
      },
    }))

    const config = loadSagaConfig(tempDir)
    expect(config).not.toBeNull()
    expect(config!.agent.sagaHandle).toBe('marcus-chen')
    expect(config!.hub?.url).toBe('https://agents.d7r.io')
  })

  it('returns null when config missing', () => {
    const config = loadSagaConfig(tempDir)
    expect(config).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    const sagaDir = join(tempDir, '.saga')
    mkdirSync(sagaDir, { recursive: true })
    writeFileSync(join(sagaDir, 'config.json'), 'not json')

    const config = loadSagaConfig(tempDir)
    expect(config).toBeNull()
  })

  it('returns null when agent section missing', () => {
    const sagaDir = join(tempDir, '.saga')
    mkdirSync(sagaDir, { recursive: true })
    writeFileSync(join(sagaDir, 'config.json'), JSON.stringify({ hub: {} }))

    const config = loadSagaConfig(tempDir)
    expect(config).toBeNull()
  })
})
