// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // Alias the contracts package to a stub when dist/ is absent (worktree builds).
      '@saga-standard/contracts': path.resolve(
        __dirname,
        'src/__mocks__/@saga-standard/contracts.ts'
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
  },
})
