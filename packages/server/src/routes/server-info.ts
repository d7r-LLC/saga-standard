// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import type { Env } from '../bindings'

export const serverInfoRoute = new Hono<{ Bindings: Env }>()

serverInfoRoute.get('/server', c => {
  const supportedChains = c.env.SUPPORTED_CHAINS
    ? c.env.SUPPORTED_CHAINS.split(',').map(s => s.trim())
    : ['eip155:8453', 'eip155:1', 'eip155:137']

  return c.json({
    name: c.env.SERVER_NAME ?? 'SAGA Reference Hub',
    version: '0.1.0',
    sagaVersion: '1.0',
    conformanceLevel: 1,
    supportedChains,
    capabilities: ['agents', 'documents', 'transfers'],
    registrationOpen: true,
    registry: 'https://registry.saga-standard.dev',
  })
})
