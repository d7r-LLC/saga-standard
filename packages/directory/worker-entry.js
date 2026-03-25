// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Custom worker entry point that wraps the OpenNext-generated worker.
 * Required for Cloudflare Durable Object exports.
 */

//@ts-expect-error: Will be resolved by wrangler build
import openNextWorker from './.open-next/worker.js'

//@ts-expect-error: Will be resolved by wrangler build
export { DOQueueHandler } from './.open-next/.build/durable-objects/queue.js'
//@ts-expect-error: Will be resolved by wrangler build
export { DOShardedTagCache } from './.open-next/.build/durable-objects/sharded-tag-cache.js'
//@ts-expect-error: Will be resolved by wrangler build
export { BucketCachePurge } from './.open-next/.build/durable-objects/bucket-cache-purge.js'

export default {
  fetch: openNextWorker.fetch,
}
