// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import { resolveApiKey, getProviderEnvKey } from '../services/llm'
import type { Env } from '../bindings'

describe('resolveApiKey', () => {
  it('returns X-LLM-API-Key header when present', () => {
    expect(
      resolveApiKey({
        header: 'sk-header-key',
        bodyApiKey: 'sk-body-key',
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-header-key')
  })

  it('falls back to body apiKey when header is missing', () => {
    expect(
      resolveApiKey({
        header: undefined,
        bodyApiKey: 'sk-body-key',
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-body-key')
  })

  it('falls back to env var when header and body are missing', () => {
    expect(
      resolveApiKey({
        header: undefined,
        bodyApiKey: undefined,
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-env-key')
  })

  it('returns null when no key is available', () => {
    expect(
      resolveApiKey({
        header: undefined,
        bodyApiKey: undefined,
        envApiKey: undefined,
      })
    ).toBeNull()
  })

  it('ignores empty string values', () => {
    expect(
      resolveApiKey({
        header: '',
        bodyApiKey: '',
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-env-key')
  })
})

describe('getProviderEnvKey', () => {
  it('returns ANTHROPIC_API_KEY for anthropic provider', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-123' } as unknown as Env
    expect(getProviderEnvKey('anthropic', env)).toBe('sk-ant-123')
  })

  it('returns OPENAI_API_KEY for openai provider', () => {
    const env = { OPENAI_API_KEY: 'sk-oai-456' } as unknown as Env
    expect(getProviderEnvKey('openai', env)).toBe('sk-oai-456')
  })

  it('returns GOOGLE_AI_API_KEY for google provider', () => {
    const env = { GOOGLE_AI_API_KEY: 'goog-789' } as unknown as Env
    expect(getProviderEnvKey('google', env)).toBe('goog-789')
  })

  it('returns undefined for unknown provider', () => {
    const env = {} as unknown as Env
    expect(getProviderEnvKey('unknown', env)).toBeUndefined()
  })

  it('returns undefined when env var is not set', () => {
    const env = {} as unknown as Env
    expect(getProviderEnvKey('anthropic', env)).toBeUndefined()
  })
})
