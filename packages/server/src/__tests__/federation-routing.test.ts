// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it } from 'vitest'

/**
 * Cross-directory routing tests.
 *
 * These require two running hubs or a full integration harness.
 * Placeholder until integration test infrastructure is ready.
 */
describe('parseRecipientDirectory', () => {
  it.todo('parses handle@directoryId correctly')
})

describe('Cross-directory routing decisions', () => {
  it.todo('routes local recipient (same directoryId) via local delivery')
  it.todo('detects cross-directory recipient and attempts federation forward')
  it.todo('treats recipient without @directoryId as local')
})
