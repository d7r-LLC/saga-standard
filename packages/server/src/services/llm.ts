// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'

/**
 * Resolve API key from request header, body, or environment.
 * Priority: header → body → env → null
 */
export function resolveApiKey(opts: {
  header: string | undefined
  bodyApiKey: string | undefined
  envApiKey: string | undefined
}): string | null {
  if (opts.header) return opts.header
  if (opts.bodyApiKey) return opts.bodyApiKey
  if (opts.envApiKey) return opts.envApiKey
  return null
}

/**
 * Look up the provider-specific API key from environment variables.
 */
export function getProviderEnvKey(provider: string, env: Env): string | undefined {
  const keyMap: Record<string, keyof Env> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
  }
  const envKey = keyMap[provider]
  return envKey ? (env[envKey] as string | undefined) : undefined
}
