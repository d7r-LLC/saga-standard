// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  target: 'es2022',
  sourcemap: true,
  noExternal: ['js-yaml'],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
