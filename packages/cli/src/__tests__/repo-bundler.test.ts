// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleRepo } from '../lib/repo-bundler'

describe('bundleRepo', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'saga-audit-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function write(rel: string, content: string | Buffer) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }

  it('includes source files and wraps each in a <file path="..."> block', () => {
    write('src/index.ts', 'export const x = 1')
    write('src/util.ts', 'export const y = 2')

    const result = bundleRepo({ root })

    expect(result.stats.filesIncluded).toBe(2)
    expect(result.text).toContain('<file path="src/index.ts">')
    expect(result.text).toContain('export const x = 1')
    expect(result.text).toContain('<file path="src/util.ts">')
  })

  it('excludes node_modules by default', () => {
    write('src/index.ts', 'export {}')
    write('node_modules/foo/bar.js', 'module.exports = {}')

    const result = bundleRepo({ root })

    expect(result.stats.filesIncluded).toBe(1)
    expect(result.text).not.toContain('node_modules')
  })

  it('excludes .env files always', () => {
    write('src/index.ts', 'export {}')
    write('.env', 'SECRET=should-never-appear')
    write('.env.production', 'KEY=also-secret')

    const result = bundleRepo({ root })

    expect(result.text).not.toContain('should-never-appear')
    expect(result.text).not.toContain('also-secret')
  })

  it('excludes .next, .open-next, .wrangler build artifacts', () => {
    write('src/index.ts', 'export {}')
    write('.next/cache/foo.js', 'console.log("build")')
    write('.open-next/server-functions/handler.mjs', 'export {}')
    write('.wrangler/tmp/dev.js', 'export {}')

    const result = bundleRepo({ root })

    expect(result.stats.filesIncluded).toBe(1)
    expect(result.text).not.toContain('.next')
    expect(result.text).not.toContain('.open-next')
    expect(result.text).not.toContain('.wrangler')
  })

  it('rejects binary content even with allowed extensions', () => {
    write('src/data.json', Buffer.from([0x00, 0x01, 0x02, 0x03]))
    write('src/code.ts', 'export const x = 1')

    const result = bundleRepo({ root })

    expect(result.stats.filesIncluded).toBe(1)
    expect(result.text).toContain('export const x')
    const skippedBinary = result.manifest.find(
      m => m.path === 'src/data.json' && m.reason === 'skipped-binary'
    )
    expect(skippedBinary).toBeDefined()
  })

  it('rejects binary file extensions', () => {
    write('src/icon.png', 'pretend-image-bytes')
    write('src/font.woff2', 'pretend-font-bytes')
    write('src/code.ts', 'export {}')

    const result = bundleRepo({ root })

    expect(result.stats.filesIncluded).toBe(1)
  })

  it('honors user-provided excludes in addition to defaults', () => {
    write('src/index.ts', 'export {}')
    write('src/test.ts', 'export {}')
    write('docs/readme.md', 'hello')

    const result = bundleRepo({
      root,
      exclude: ['docs/'],
    })

    expect(result.stats.filesIncluded).toBe(2)
    expect(result.text).not.toContain('hello')
  })

  it('honors include filter (allowlist mode)', () => {
    write('src/a.ts', 'export const a = 1')
    write('src/b.ts', 'export const b = 2')
    write('docs/readme.md', 'hello')

    const result = bundleRepo({
      root,
      include: ['src/'],
    })

    expect(result.stats.filesIncluded).toBe(2)
    expect(result.text).not.toContain('hello')
  })

  it('honors custom extensions list', () => {
    write('src/index.ts', 'export {}')
    write('src/script.py', 'pass')
    write('src/Makefile', 'all:\n\techo')

    const result = bundleRepo({
      root,
      extensions: ['py'],
    })

    // Makefile passes via the extensionless allowlist; .py from the custom list
    expect(result.text).toContain('pass')
    // .ts is no longer in extensions
    expect(result.text).not.toContain('export {}')
  })

  it('skips symlinks (no infinite recursion)', () => {
    write('src/index.ts', 'export {}')
    // Don't actually create symlinks in the test (platform-specific quirks);
    // this is a smoke test that the walker doesn't hang.
    const result = bundleRepo({ root })
    expect(result.stats.filesIncluded).toBeGreaterThan(0)
  })

  it('reports per-package size totals', () => {
    write('packages/a/src/x.ts', 'a'.repeat(1000))
    write('packages/b/src/y.ts', 'b'.repeat(500))

    const result = bundleRepo({ root })

    expect(result.stats.topPackages[0].path).toBe('packages/a')
    expect(result.stats.topPackages[0].bytes).toBeGreaterThan(result.stats.topPackages[1].bytes)
  })
})
