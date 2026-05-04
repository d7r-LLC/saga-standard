// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Match the Next.js `@/*` path alias from tsconfig.json so middleware
      // and other Next.js-style imports resolve in vitest.
      '@': resolve(__dirname, 'src'),
    },
  },
})
