// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { SagaServerClient } from '@epicdm/saga-client'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function createSagaClient(): Promise<SagaServerClient> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  return new SagaServerClient({ serverUrl: env.SAGA_SERVER_URL })
}

export async function createAuthenticatedSagaClient(
  sagaToken: string,
): Promise<SagaServerClient> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  return new SagaServerClient({
    serverUrl: env.SAGA_SERVER_URL,
    auth: {
      token: sagaToken,
      expiresAt: new Date(Date.now() + 3600000),
      walletAddress: '',
      serverUrl: env.SAGA_SERVER_URL,
    },
  })
}
