// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/ts/**/*.test.ts'],
    exclude: ['lib/**', 'node_modules/**'],
  },
})
