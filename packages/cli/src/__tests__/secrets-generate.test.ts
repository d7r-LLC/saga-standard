// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { secretsGenerateCommand } from '../commands/secrets-generate'

const TEST_ROOT = join(tmpdir(), `saga-secrets-generate-test-${Date.now()}`)

function setupFakeMonorepo(): string {
  // Mirror the layout the command expects: packages/server/wrangler.toml.
  const serverDir = join(TEST_ROOT, 'packages', 'server')
  mkdirSync(serverDir, { recursive: true })
  writeFileSync(join(serverDir, 'wrangler.toml'), '# fake wrangler.toml for test\n')
  return serverDir
}

async function runCommand(
  args: string[]
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  // commander's .parseAsync returns control once the action handler resolves.
  // Capture process.exit and console output. We spy on console.{error,log}
  // rather than process.{stdout,stderr}.write because Node caches the
  // stream's write reference at console-construction time, so monkey-
  // patching process.stderr.write after the fact doesn't intercept
  // console.error calls.
  const origExit = process.exit
  const origConsoleLog = console.log
  const origConsoleError = console.error
  let exitCode = 0
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  process.exit = ((code?: number) => {
    exitCode = code ?? 0
    throw new Error(`__test_process_exit_${exitCode}`)
  }) as never
  console.log = (...args: unknown[]) => {
    stdoutChunks.push(`${args.map(String).join(' ')}\n`)
  }
  console.error = (...args: unknown[]) => {
    stderrChunks.push(`${args.map(String).join(' ')}\n`)
  }
  try {
    // commander parses ['node', 'cli', ...args]
    await secretsGenerateCommand.parseAsync(['node', 'secrets-generate', ...args])
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('__test_process_exit_')) {
      throw err
    }
  } finally {
    process.exit = origExit
    console.log = origConsoleLog
    console.error = origConsoleError
  }
  return { exitCode, stderr: stderrChunks.join(''), stdout: stdoutChunks.join('') }
}

describe('secrets-generate', () => {
  let serverDir: string
  let origCwd: string

  beforeEach(() => {
    serverDir = setupFakeMonorepo()
    origCwd = process.cwd()
    process.chdir(TEST_ROOT)
  })

  afterEach(() => {
    process.chdir(origCwd)
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true })
    }
  })

  it('writes a .env.<env> file with generated + placeholder entries', async () => {
    await runCommand(['--env', 'staging'])

    const outPath = join(serverDir, '.env.staging')
    expect(existsSync(outPath)).toBe(true)

    const content = readFileSync(outPath, 'utf-8')
    // Generated entries are present with values:
    expect(content).toMatch(/^ADMIN_SECRET=[0-9a-f]{64}$/m)
    expect(content).toMatch(/^OPERATOR_PRIVATE_KEY=0x[0-9a-f]{64}$/m)
    // Placeholders are commented-out so wrangler-secret-put doesn't push empty:
    expect(content).toMatch(/^# ANTHROPIC_API_KEY=/m)
    expect(content).toMatch(/^# OPENAI_API_KEY=/m)
    expect(content).toMatch(/^# GOOGLE_AI_API_KEY=/m)
  })

  it('writes file with 0600 permissions (owner-only)', async () => {
    await runCommand(['--env', 'staging'])
    const outPath = join(serverDir, '.env.staging')
    const mode = statSync(outPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('refuses to overwrite an existing file without --force', async () => {
    const outPath = join(serverDir, '.env.staging')
    writeFileSync(outPath, 'existing content', { mode: 0o600 })

    const { exitCode, stderr } = await runCommand(['--env', 'staging'])

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Refusing to overwrite')
    // File should be unchanged.
    expect(readFileSync(outPath, 'utf-8')).toBe('existing content')
  })

  it('overwrites an existing file with --force', async () => {
    const outPath = join(serverDir, '.env.staging')
    writeFileSync(outPath, 'existing content', { mode: 0o600 })

    await runCommand(['--env', 'staging', '--force'])

    const content = readFileSync(outPath, 'utf-8')
    expect(content).not.toBe('existing content')
    expect(content).toMatch(/^ADMIN_SECRET=/m)
  })

  it('refuses to generate production secrets without --force', async () => {
    const { exitCode, stderr } = await runCommand(['--env', 'production'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/production secrets/i)
  })

  it('generates DIFFERENT random values on consecutive runs', async () => {
    const outPath = join(serverDir, '.env.staging')

    await runCommand(['--env', 'staging'])
    const first = readFileSync(outPath, 'utf-8')

    await runCommand(['--env', 'staging', '--force'])
    const second = readFileSync(outPath, 'utf-8')

    const adminFirst = first.match(/^ADMIN_SECRET=([0-9a-f]+)$/m)?.[1]
    const adminSecond = second.match(/^ADMIN_SECRET=([0-9a-f]+)$/m)?.[1]
    expect(adminFirst).toBeTruthy()
    expect(adminSecond).toBeTruthy()
    expect(adminFirst).not.toBe(adminSecond)

    const opkFirst = first.match(/^OPERATOR_PRIVATE_KEY=(0x[0-9a-f]+)$/m)?.[1]
    const opkSecond = second.match(/^OPERATOR_PRIVATE_KEY=(0x[0-9a-f]+)$/m)?.[1]
    expect(opkFirst).toBeTruthy()
    expect(opkSecond).toBeTruthy()
    expect(opkFirst).not.toBe(opkSecond)
  })

  it('writes 1Password layout hints in the file header', async () => {
    await runCommand(['--env', 'staging'])
    const content = readFileSync(join(serverDir, '.env.staging'), 'utf-8')
    expect(content).toMatch(/op:\/\/saga-staging\/saga-server-staging-admin-secret\/value/)
    expect(content).toMatch(/op:\/\/saga-staging\/saga-server-staging-operator-private-key\/value/)
    expect(content).toMatch(/op:\/\/saga-staging\/saga-server-staging-anthropic-api-key\/value/)
  })

  it('writes to a custom --out path when provided', async () => {
    const customPath = join(TEST_ROOT, 'custom-secrets', 'custom.env')
    await runCommand(['--env', 'staging', '--out', customPath])
    expect(existsSync(customPath)).toBe(true)
  })
})
