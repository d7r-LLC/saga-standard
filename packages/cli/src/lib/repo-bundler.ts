// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export interface BundleOptions {
  /** Repo root to bundle. */
  root: string
  /** Additional exclude globs (substring match against the relative path). */
  exclude?: string[]
  /** Additional include globs (if non-empty, ONLY these paths are included). */
  include?: string[]
  /** File extensions to include (no leading dot). Defaults to a code/doc set. */
  extensions?: string[]
  /** Hard cap on bundled bytes; overflow files are skipped with a warning. */
  maxBytes?: number
}

export interface BundleStats {
  filesIncluded: number
  filesSkipped: number
  bytes: number
  estimatedTokens: number
  topPackages: Array<{ path: string; bytes: number }>
}

export interface BundleResult {
  text: string
  stats: BundleStats
  manifest: ManifestEntry[]
}

export interface ManifestEntry {
  path: string
  bytes: number
  reason?: 'skipped-binary' | 'skipped-excluded' | 'skipped-extension' | 'skipped-too-large'
}

/**
 * Default extensions to include. Code, configuration, documentation.
 * Binary types (images, fonts, archives) are always rejected even if the
 * extension is in this list.
 */
const DEFAULT_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'sol',
  'md',
  'mdx',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'sh',
  'fish',
  'sql',
  'rs',
  'py',
  'go',
  'html',
  'css',
  'scss',
  'graphql',
  'gql',
  'env.example',
]

/**
 * Default exclude patterns. Substring match against the path RELATIVE to the
 * bundle root, posix-style separators. Also matches single path components.
 */
const DEFAULT_EXCLUDES = [
  // Dependency / artifact dirs
  'node_modules',
  '.git/',
  '.worktrees/',
  'dist/',
  'build/',
  'out/',
  '.next/',
  '.turbo/',
  '.cache/',
  'coverage/',
  '.nyc_output/',
  // Foundry build artifacts + vendored deps
  '/cache/',
  '/broadcast/',
  '/lib/forge-std/',
  '/lib/openzeppelin-contracts/',
  // Cloudflare / OpenNext build outputs
  '.open-next/',
  '.wrangler/',
  // Next.js misc
  'next-env.d.ts',
  // TS incremental build info
  '.tsbuildinfo',
  // Old superpowers session transcripts (planning, not code) — keep code/specs
  'docs/superpowers/',
  '.superpowers/',
  // Lock files (huge, low signal)
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'bun.lockb',
  // Snapshots
  '.snap',
  '__snapshots__/',
  // Generated / vendored
  'generated/',
  '/vendor/',
  // Logs
  '.log',
  // Secrets — NEVER bundle these
  '.env',
  '.dev.vars',
  // Audits output dir (don't recursively include past audits)
  '/audits/',
]

/**
 * Binary extensions — never bundled even if matched by include filters.
 * Listed without the leading dot.
 */
const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'svg',
  'pdf',
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  '7z',
  'rar',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp3',
  'mp4',
  'mov',
  'webm',
  'wasm',
  'so',
  'dylib',
  'dll',
  'exe',
  'bin',
  'lockb',
])

/** Files >2 MB are skipped (likely generated or non-source). Override via maxBytes. */
const DEFAULT_PER_FILE_LIMIT = 2 * 1024 * 1024

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  if (idx < 0) return ''
  return filename.slice(idx + 1).toLowerCase()
}

function isBinaryByExtension(filename: string): boolean {
  return BINARY_EXTENSIONS.has(getExtension(filename))
}

function matchesAny(path: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (path.includes(p)) return true
  }
  return false
}

function looksBinaryFromContent(buf: Buffer): boolean {
  // Heuristic: any NUL byte in the first 8KB strongly suggests binary.
  const slice = buf.subarray(0, Math.min(buf.length, 8192))
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return true
  }
  return false
}

function* walk(root: string, current: string): Generator<string> {
  let entries
  try {
    entries = readdirSync(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(current, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      yield* walk(root, full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

export function bundleRepo(options: BundleOptions): BundleResult {
  const root = resolve(options.root)
  const extensions = new Set((options.extensions ?? DEFAULT_EXTENSIONS).map(e => e.toLowerCase()))
  const userExcludes = options.exclude ?? []
  const includes = options.include ?? []
  const maxBytes = options.maxBytes ?? DEFAULT_PER_FILE_LIMIT

  const allExcludes = [...DEFAULT_EXCLUDES, ...userExcludes]

  const manifest: ManifestEntry[] = []
  const fileBlocks: string[] = []
  const packageBytes = new Map<string, number>()

  let bytes = 0
  let filesIncluded = 0
  let filesSkipped = 0

  for (const fullPath of walk(root, root)) {
    const rel = relative(root, fullPath).split(sep).join('/')

    // Exclude check (default + user)
    if (matchesAny(`/${rel}`, allExcludes) || matchesAny(rel, allExcludes)) {
      manifest.push({ path: rel, bytes: 0, reason: 'skipped-excluded' })
      filesSkipped++
      continue
    }

    // Include check (if explicit includes provided, file must match one)
    if (includes.length > 0 && !matchesAny(rel, includes)) {
      manifest.push({ path: rel, bytes: 0, reason: 'skipped-excluded' })
      filesSkipped++
      continue
    }

    // Binary by extension
    if (isBinaryByExtension(rel)) {
      manifest.push({ path: rel, bytes: 0, reason: 'skipped-binary' })
      filesSkipped++
      continue
    }

    // Extension filter — special case: files with no extension we accept if
    // their basename is a known config (Dockerfile, Makefile, .gitignore, etc.)
    const ext = getExtension(rel)
    const basename = rel.split('/').pop() ?? ''
    const isWellKnownExtensionless =
      basename === 'Dockerfile' ||
      basename === 'Makefile' ||
      basename === '.gitignore' ||
      basename === '.dockerignore' ||
      basename === '.editorconfig' ||
      basename === '.npmrc' ||
      basename === 'CLAUDE.md' ||
      basename === 'CNAME'
    if (ext && !extensions.has(ext) && !isWellKnownExtensionless) {
      manifest.push({ path: rel, bytes: 0, reason: 'skipped-extension' })
      filesSkipped++
      continue
    }

    // Stat first to filter on size
    let size: number
    try {
      size = statSync(fullPath).size
    } catch {
      filesSkipped++
      continue
    }
    if (size > maxBytes) {
      manifest.push({ path: rel, bytes: size, reason: 'skipped-too-large' })
      filesSkipped++
      continue
    }

    // Read; reject if content reads as binary
    let buf: Buffer
    try {
      buf = readFileSync(fullPath)
    } catch {
      filesSkipped++
      continue
    }
    if (looksBinaryFromContent(buf)) {
      manifest.push({ path: rel, bytes: size, reason: 'skipped-binary' })
      filesSkipped++
      continue
    }

    const content = buf.toString('utf-8')
    fileBlocks.push(`<file path="${rel}">\n${content}\n</file>`)
    manifest.push({ path: rel, bytes: size })
    bytes += size
    filesIncluded++

    // Track per-package totals (first 2 segments — e.g. "packages/contracts").
    const segs = rel.split('/')
    const pkg = segs.length >= 2 ? segs.slice(0, 2).join('/') : segs[0]
    packageBytes.set(pkg, (packageBytes.get(pkg) ?? 0) + size)
  }

  const text = fileBlocks.join('\n\n')
  // Empirical ratio for this codebase against Anthropic's tokenizer:
  // ~2.4 chars per token (TypeScript + Solidity + JSON config + markdown spec).
  // Use 2.5 for a slight safety margin without being wildly conservative.
  // A 781K-token estimate at 3.5 turned out to be 1,152K real tokens — that
  // bug is prevented by this lower divisor.
  const estimatedTokens = Math.ceil(text.length / 2.5)

  const topPackages = [...packageBytes.entries()]
    .map(([path, bytes]) => ({ path, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)

  return {
    text,
    stats: { filesIncluded, filesSkipped, bytes, estimatedTokens, topPackages },
    manifest,
  }
}
