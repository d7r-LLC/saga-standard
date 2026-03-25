// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

interface CloudflareEnv {
  SESSIONS: KVNamespace
  SAGA_SERVER_URL: string
  WALLETCONNECT_PROJECT_ID?: string
}

declare module '@opennextjs/cloudflare' {
  export function getCloudflareContext<T = { env: CloudflareEnv }>(): Promise<T>
}
