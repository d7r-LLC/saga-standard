// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
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

/**
 * Build AI Gateway base URL for a provider.
 * Returns null if gateway is not configured (direct provider access).
 */
export function buildGatewayBaseUrl(env: Env, provider: string): string | null {
  if (!env.CF_GATEWAY_NAME || !env.CF_ACCOUNT_ID) return null
  return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_GATEWAY_NAME}/${provider}`
}

/**
 * Create an AI SDK LanguageModelV1 instance for the given provider/model.
 * Routes through AI Gateway when configured.
 */
export function createModel(
  provider: string,
  modelId: string,
  apiKey: string,
  env: Env
): LanguageModel {
  const baseURL = buildGatewayBaseUrl(env, provider) ?? undefined

  switch (provider) {
    case 'anthropic': {
      const client = createAnthropic({ apiKey, ...(baseURL && { baseURL }) })
      return client(modelId)
    }
    case 'openai': {
      const client = createOpenAI({ apiKey, ...(baseURL && { baseURL }) })
      return client(modelId)
    }
    case 'google': {
      const client = createGoogleGenerativeAI({ apiKey, ...(baseURL && { baseURL }) })
      return client(modelId)
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

/** Per-million-token pricing for known models */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250514': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

/**
 * Estimate cost in USD based on model and token counts.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
}
