// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
