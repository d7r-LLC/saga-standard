// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

interface CloudflareEnv {
  DB: D1Database
  CACHE: KVNamespace
  SESSIONS: KVNamespace
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket
  IDENTITY_ISSUER_URL: string
  CRON_SECRET: string
  WEBHOOK_SECRET: string
  REGISTRATION_ENABLED?: string
  TREASURY_WALLET_ADDRESS: string
  PAYMENT_SERVICE_URL?: string
}

declare module '@opennextjs/cloudflare' {
  export function getCloudflareContext(): Promise<{
    env: CloudflareEnv
    ctx: ExecutionContext
  }>
}
