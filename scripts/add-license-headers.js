#!/usr/bin/env node
/* eslint-env node */
/**
 * Add SPDX license headers to source files.
 *
 * Usage:
 *   node scripts/add-license-headers.js          # Add headers to all files missing them
 *   node scripts/add-license-headers.js --check   # Check only (exit 1 if any missing)
 *   node scripts/add-license-headers.js --files file1.ts file2.ts  # Add to specific files
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT_DIR = path.resolve(__dirname, '..')

const SPDX_HEADER_TS = `// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC
`

const SPDX_HEADER_CSS = `/* SPDX-License-Identifier: Apache-2.0 */
/* Copyright 2026 d7r LLC */
`

/**
 * Check if file content already has an SPDX license header.
 */
function hasLicenseHeader(content) {
  if (!content || content.length === 0) {
    return false
  }
  return content.includes('SPDX-License-Identifier')
}

/**
 * Get the appropriate header for a given file extension.
 */
function getHeaderForExtension(ext) {
  switch (ext) {
    case '.css':
    case '.scss':
      return SPDX_HEADER_CSS
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
    default:
      return SPDX_HEADER_TS
  }
}

/**
 * Add a license header to file content, respecting shebangs and eslint-env comments.
 */
function addLicenseHeader(content, ext) {
  if (hasLicenseHeader(content)) {
    return content
  }

  const header = getHeaderForExtension(ext)
  const lines = content.split('\n')
  const preservedLines = []
  let startIndex = 0

  // Preserve shebang
  if (lines[0] && lines[0].startsWith('#!')) {
    preservedLines.push(lines[0])
    startIndex = 1
  }

  // Preserve eslint-env comments at the top
  if (lines[startIndex] && /^\s*\/\*\s*eslint-env\s/.test(lines[startIndex])) {
    preservedLines.push(lines[startIndex])
    startIndex++
  }

  const restOfFile = lines.slice(startIndex).join('\n')

  if (preservedLines.length > 0) {
    return `${preservedLines.join('\n')}\n${header}\n${restOfFile}`
  }

  return `${header}\n${restOfFile}`
}

/**
 * Get all source files under packages/ that should have license headers.
 */
function getSourceFiles() {
  const extensions = ['ts', 'tsx', 'js', 'jsx', 'css', 'scss']
  const includePattern = extensions.map(e => `--include="*.${e}"`).join(' ')

  const excludeDirs = ['node_modules', 'dist', 'build', 'coverage', '.turbo', '.cache']
  const excludePattern = excludeDirs.map(d => `--exclude-dir="${d}"`).join(' ')

  const cmd = `grep -rl --files-with-matches "" ${includePattern} ${excludePattern} "${path.join(ROOT_DIR, 'packages')}"`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return output
      .trim()
      .split('\n')
      .filter(f => f.length > 0)
      .filter(f => {
        const rel = path.relative(ROOT_DIR, f)
        return (
          !rel.includes('node_modules') &&
          !rel.match(/[/\\]dist[/\\]/) &&
          !rel.match(/[/\\]build[/\\]/) &&
          !rel.match(/[/\\]coverage[/\\]/)
        )
      })
  } catch {
    return []
  }
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const filesIndex = args.indexOf('--files')

  let files
  if (filesIndex !== -1) {
    files = args.slice(filesIndex + 1).map(f => path.resolve(f))
  } else {
    files = getSourceFiles()
  }

  const missing = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    if (!hasLicenseHeader(content)) {
      missing.push(file)
      if (!checkOnly) {
        const ext = path.extname(file)
        const updated = addLicenseHeader(content, ext)
        fs.writeFileSync(file, updated, 'utf-8')
      }
    }
  }

  if (checkOnly) {
    if (missing.length > 0) {
      console.error(`${missing.length} files missing SPDX license headers:`)
      for (const f of missing.slice(0, 20)) {
        console.error(`  ${path.relative(ROOT_DIR, f)}`)
      }
      if (missing.length > 20) {
        console.error(`  ... and ${missing.length - 20} more`)
      }
      process.exit(1)
    } else {
      console.error('All source files have SPDX license headers.')
      process.exit(0)
    }
  } else {
    if (missing.length > 0) {
      console.error(`Added SPDX license headers to ${missing.length} files.`)
    } else {
      console.error('All source files already have SPDX license headers.')
    }
  }
}

module.exports = {
  SPDX_HEADER_TS,
  SPDX_HEADER_CSS,
  hasLicenseHeader,
  addLicenseHeader,
  getSourceFiles,
  getHeaderForExtension,
}
