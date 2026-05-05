// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock child_process BEFORE importing the command. The command shells
// out to `op` for vault list / item create / item edit; tests stub
// every invocation through the same execFileSync / spawnSync spy.
const execFileSync = vi.fn<(...args: unknown[]) => Buffer | string>()
const spawnSync =
  vi.fn<(...args: unknown[]) => { status: number; stdout: string; stderr: string }>()
vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

const { secretsPushCommand } = await import('../commands/secrets-push')

const TEST_ROOT = join(tmpdir(), `saga-secrets-push-test-${Date.now()}`)

function setupFakeMonorepo(envFileContent?: string): { serverDir: string; envPath: string } {
  const serverDir = join(TEST_ROOT, 'packages', 'server')
  mkdirSync(serverDir, { recursive: true })
  writeFileSync(join(serverDir, 'wrangler.toml'), '# fake wrangler.toml\n')
  const envPath = join(serverDir, '.env.staging')
  if (envFileContent !== undefined) {
    writeFileSync(envPath, envFileContent, { mode: 0o600 })
  }
  return { serverDir, envPath }
}

async function runCommand(
  args: string[]
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
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
    await secretsPushCommand.parseAsync(['node', 'secrets-push', ...args])
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

/**
 * Set up execFileSync mock to simulate a baseline op CLI session:
 *   - `op vault list` returns a single existing vault
 *   - `op item get` for any item -> non-zero (item doesn't exist yet)
 */
function mockOpBaseline(opts: { vaultExists?: boolean } = {}): void {
  const vaultExists = opts.vaultExists ?? true
  execFileSync.mockImplementation((_cmd, args) => {
    const argList = args as string[]
    if (argList[0] === 'vault' && argList[1] === 'list') {
      const vaults = vaultExists ? [{ name: 'saga-staging' }] : []
      return Buffer.from(JSON.stringify(vaults))
    }
    if (argList[0] === 'vault' && argList[1] === 'create') {
      return Buffer.from('vault created')
    }
    if (argList[0] === 'item' && argList[1] === 'get') {
      throw new Error('item not found')
    }
    return Buffer.from('')
  })
  spawnSync.mockImplementation(() => ({ status: 0, stdout: 'ok', stderr: '' }))
}

describe('secrets-push', () => {
  let envPath: string
  let origCwd: string

  beforeEach(() => {
    execFileSync.mockReset()
    spawnSync.mockReset()
    const fixture = setupFakeMonorepo(
      [
        '# header comment',
        'ADMIN_SECRET=deadbeef'.padEnd(72, '0'),
        '# inline comment',
        'OPERATOR_PRIVATE_KEY=0xcafebabe'.padEnd(72, '0'),
        '',
        '# ANTHROPIC_API_KEY=  # commented placeholder',
      ].join('\n')
    )
    envPath = fixture.envPath
    origCwd = process.cwd()
    process.chdir(TEST_ROOT)
  })

  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true })
    }
  })

  it('parses .env.<env> and pushes each KEY=VALUE pair via op item create', async () => {
    mockOpBaseline()
    const { exitCode } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(0)

    // Two `op item create` invocations expected (commented lines skipped):
    const itemCreates = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === 'item' &&
        (c[1] as string[])[1] === 'create'
    )
    expect(itemCreates).toHaveLength(2)
    const titles = itemCreates.map(c => {
      const args = c[1] as string[]
      const idx = args.indexOf('--title')
      return args[idx + 1]
    })
    expect(titles).toContain('saga-server-staging-admin-secret')
    expect(titles).toContain('saga-server-staging-operator-private-key')
  })

  it('field assignments use the [concealed] type for both create and edit', async () => {
    mockOpBaseline()
    await runCommand(['--env', 'staging'])

    // Each spawnSync call's args should include `value[concealed]=...`.
    for (const call of spawnSync.mock.calls) {
      const args = call[1] as string[]
      const valueArg = args.find(a => typeof a === 'string' && a.startsWith('value'))
      expect(valueArg).toBeDefined()
      expect(valueArg?.startsWith('value[concealed]=')).toBe(true)
    }
  })

  it('uses `op item edit` when the item already exists (idempotent update)', async () => {
    // Override: every `item get` succeeds (item exists).
    execFileSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList[0] === 'vault' && argList[1] === 'list') {
        return Buffer.from(JSON.stringify([{ name: 'saga-staging' }]))
      }
      if (argList[0] === 'item' && argList[1] === 'get') {
        return Buffer.from('{"id":"existing"}')
      }
      return Buffer.from('')
    })
    spawnSync.mockImplementation(() => ({ status: 0, stdout: 'ok', stderr: '' }))

    await runCommand(['--env', 'staging'])

    const editCalls = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) && (c[1] as string[])[0] === 'item' && (c[1] as string[])[1] === 'edit'
    )
    const createCalls = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === 'item' &&
        (c[1] as string[])[1] === 'create'
    )
    expect(editCalls.length).toBe(2)
    expect(createCalls.length).toBe(0)
  })

  it('creates the vault when missing', async () => {
    mockOpBaseline({ vaultExists: false })
    await runCommand(['--env', 'staging'])

    const vaultCreates = execFileSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === 'vault' &&
        (c[1] as string[])[1] === 'create'
    )
    expect(vaultCreates).toHaveLength(1)
    expect((vaultCreates[0][1] as string[])[2]).toBe('saga-staging')
  })

  it('deletes the local .env file after a successful push (default)', async () => {
    mockOpBaseline()
    expect(existsSync(envPath)).toBe(true)
    await runCommand(['--env', 'staging'])
    expect(existsSync(envPath)).toBe(false)
  })

  it('preserves the local .env file with --keep-file', async () => {
    mockOpBaseline()
    await runCommand(['--env', 'staging', '--keep-file'])
    expect(existsSync(envPath)).toBe(true)
  })

  it('preserves the local .env file when push partially fails', async () => {
    execFileSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList[0] === 'vault' && argList[1] === 'list') {
        return Buffer.from(JSON.stringify([{ name: 'saga-staging' }]))
      }
      if (argList[0] === 'item' && argList[1] === 'get') throw new Error('not found')
      return Buffer.from('')
    })
    let nthSpawn = 0
    spawnSync.mockImplementation(() => {
      nthSpawn += 1
      // Fail the second item create, succeed the first.
      if (nthSpawn === 2) {
        return { status: 1, stdout: '', stderr: 'op auth error\n' }
      }
      return { status: 0, stdout: 'ok', stderr: '' }
    })

    const { exitCode } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(existsSync(envPath)).toBe(true)
  })

  it('rejects inline-comment syntax (KEY=VALUE  # note) loudly', async () => {
    // Per Copilot review on PR #62: parseEnvFile previously claimed
    // to reject inline comments but actually accepted them, silently
    // including the trailing ` # note` in the secret value uploaded
    // to 1Password. Now: parse throws, command surfaces the line
    // number, file is preserved.
    writeFileSync(
      envPath,
      [
        `ADMIN_SECRET=${'a'.repeat(64)}`,
        `OPERATOR_PRIVATE_KEY=0x${'b'.repeat(64)}   # rotate later`,
      ].join('\n'),
      { mode: 0o600 }
    )
    const { exitCode, stderr } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/inline comments/i)
    // No 1P calls fired since the parse failed before any work.
    expect(execFileSync.mock.calls.length + spawnSync.mock.calls.length).toBe(0)
    // File preserved for the operator to fix.
    expect(existsSync(envPath)).toBe(true)
  })

  it('refuses production env unless vault is saga-prod or saga-production', async () => {
    setupFakeMonorepo('FOO=bar')
    const { exitCode, stderr } = await runCommand([
      '--env',
      'production',
      '--vault',
      'saga-staging',
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/production secrets/i)
  })

  it('--dry-run lists what would push without contacting op', async () => {
    mockOpBaseline()
    const { exitCode, stdout } = await runCommand(['--env', 'staging', '--dry-run'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('saga-server-staging-admin-secret')
    expect(stdout).toContain('saga-server-staging-operator-private-key')
    // Zero op calls in dry-run.
    expect(execFileSync.mock.calls.length + spawnSync.mock.calls.length).toBe(0)
  })

  it('exits when input file is missing', async () => {
    rmSync(envPath)
    const { exitCode, stderr } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/not found/i)
  })

  it('exits when input file has no parseable KEY=VALUE entries', async () => {
    writeFileSync(envPath, '# all commented\n# ANTHROPIC_API_KEY=\n', { mode: 0o600 })
    const { exitCode, stderr } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/no secrets to push/i)
  })

  it('does NOT log secret values to stdout/stderr (redaction discipline)', async () => {
    mockOpBaseline()
    const { stdout, stderr } = await runCommand(['--env', 'staging'])

    // The fixture's ADMIN_SECRET starts with 'deadbeef'. Should never
    // appear in command output.
    expect(stdout).not.toContain('deadbeef')
    expect(stderr).not.toContain('deadbeef')
    expect(stdout).not.toContain('cafebabe')
    expect(stderr).not.toContain('cafebabe')
  })
})
