// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock child_process before import (same pattern as secrets-push tests).
const execFileSync = vi.fn<(...args: unknown[]) => Buffer | string>()
const spawnSync =
  vi.fn<(...args: unknown[]) => { status: number | null; stdout: string; stderr: string }>()
vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

const { secretsDeployCommand } = await import('../commands/secrets-deploy')

const TEST_ROOT = join(tmpdir(), `saga-secrets-deploy-test-${Date.now()}`)

function setupFakeMonorepo(): void {
  const serverDir = join(TEST_ROOT, 'packages', 'server')
  mkdirSync(serverDir, { recursive: true })
  writeFileSync(join(serverDir, 'wrangler.toml'), '# fake wrangler.toml\n')
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
    await secretsDeployCommand.parseAsync(['node', 'secrets-deploy', ...args])
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
 * Configure mocks for the "all-required-secrets-present" happy path:
 *   - vault list reports saga-staging present
 *   - wrangler whoami succeeds
 *   - op read returns a value for the two required secrets and 404s
 *     for the three optional LLM keys (typical staging setup)
 *   - wrangler secret put succeeds for every required secret
 */
function mockHappyPath(opts: { presentSecrets?: string[] } = {}): void {
  const present = opts.presentSecrets ?? ['admin-secret', 'operator-private-key']
  execFileSync.mockImplementation((_cmd, args) => {
    const argList = args as string[]
    if (argList[0] === 'vault' && argList[1] === 'list') {
      return Buffer.from(JSON.stringify([{ name: 'saga-staging' }]))
    }
    return Buffer.from('')
  })
  spawnSync.mockImplementation((_cmd, args) => {
    const argList = args as string[]
    // wrangler whoami
    if (argList.includes('whoami')) {
      return { status: 0, stdout: 'authenticated', stderr: '' }
    }
    // op read op://saga-staging/<slug>/value
    if (argList[0] === 'read') {
      const uri = argList[1] as string
      const slugMatch = uri.match(/saga-server-staging-([a-z0-9-]+)\/value$/)
      const slug = slugMatch?.[1]
      if (slug && present.includes(slug)) {
        return { status: 0, stdout: `value-for-${slug}\n`, stderr: '' }
      }
      return { status: 1, stdout: '', stderr: "isn't an item in any vault\n" }
    }
    // wrangler secret put <NAME>
    if (argList.includes('secret') && argList.includes('put')) {
      return { status: 0, stdout: 'Secret uploaded.', stderr: '' }
    }
    return { status: 0, stdout: '', stderr: '' }
  })
}

describe('secrets-deploy', () => {
  let origCwd: string

  beforeEach(() => {
    execFileSync.mockReset()
    spawnSync.mockReset()
    setupFakeMonorepo()
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

  it('happy path: deploys both required secrets, skips optional LLM keys', async () => {
    mockHappyPath()
    const { exitCode, stdout } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/2 deployed/)
    expect(stdout).toMatch(/3 skipped/)
    // Summary line includes the literal "0 failed" — verify that
    // explicitly rather than blanket-banning the word "failed".
    expect(stdout).toMatch(/\b0 failed\b/)

    // Verify exactly two `wrangler secret put` invocations occurred.
    const puts = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[]).includes('secret') &&
        (c[1] as string[]).includes('put')
    )
    expect(puts).toHaveLength(2)
    const secretNames = puts.map(c => {
      const args = c[1] as string[]
      return args[args.indexOf('put') + 1]
    })
    expect(secretNames).toContain('ADMIN_SECRET')
    expect(secretNames).toContain('OPERATOR_PRIVATE_KEY')
  })

  it('passes secret values through STDIN, never argv', async () => {
    mockHappyPath()
    await runCommand(['--env', 'staging'])

    const puts = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[]).includes('secret') &&
        (c[1] as string[]).includes('put')
    )
    for (const put of puts) {
      const args = put[1] as string[]
      const opts = put[2] as { input?: string }
      // Argv must not contain the secret value itself — only the
      // wrangler subcommand + secret NAME + --env <env>.
      for (const a of args) {
        expect(a).not.toMatch(/^value-for-/)
      }
      // Input piped through stdin instead.
      expect(opts.input).toBeDefined()
      expect(typeof opts.input).toBe('string')
      expect(opts.input).toMatch(/^value-for-/)
    }
  })

  it('exits non-zero when required secret is missing in 1P', async () => {
    // Only operator-private-key present; admin-secret absent.
    mockHappyPath({ presentSecrets: ['operator-private-key'] })
    const { exitCode, stdout, stderr } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/ADMIN_SECRET/)
    expect(stderr).toMatch(/missing in 1Password/)
    // OPERATOR_PRIVATE_KEY still gets deployed.
    expect(stdout).toMatch(/1 deployed/)
  })

  it('exits non-zero when wrangler is not authenticated', async () => {
    execFileSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList[0] === 'vault' && argList[1] === 'list') {
        return Buffer.from(JSON.stringify([{ name: 'saga-staging' }]))
      }
      return Buffer.from('')
    })
    spawnSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList.includes('whoami')) {
        return { status: 1, stdout: '', stderr: 'not authenticated' }
      }
      return { status: 0, stdout: '', stderr: '' }
    })

    // Spinner.fail() writes to process.stderr directly, bypassing
    // console.error — so we observe the failure via the exit code
    // and the absence of any "deployed" output instead.
    const { exitCode, stdout } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(stdout).not.toMatch(/deployed/)
    // Verify wrangler was probed via whoami exactly once and no
    // `secret put` calls were made (auth gate fired).
    const whoamiCalls = spawnSync.mock.calls.filter(
      c => Array.isArray(c[1]) && (c[1] as string[]).includes('whoami')
    )
    expect(whoamiCalls.length).toBeGreaterThan(0)
    const putCalls = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[]).includes('secret') &&
        (c[1] as string[]).includes('put')
    )
    expect(putCalls.length).toBe(0)
  })

  it('exits non-zero when vault is missing in 1P', async () => {
    execFileSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList[0] === 'vault' && argList[1] === 'list') {
        return Buffer.from(JSON.stringify([])) // empty
      }
      return Buffer.from('')
    })
    spawnSync.mockImplementation(() => ({ status: 0, stdout: '', stderr: '' }))

    // Spinner.fail() writes to process.stderr directly. The fallback
    // hint goes through console.error, which our spy captures.
    const { exitCode, stderr } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/saga secrets generate/)
    // Wrangler should NOT have been touched if the vault check failed.
    const wranglerCalls = spawnSync.mock.calls.filter(
      c => Array.isArray(c[1]) && (c[1] as string[]).includes('wrangler')
    )
    expect(wranglerCalls.length).toBe(0)
  })

  it('--dry-run lists targets without contacting 1P or wrangler', async () => {
    mockHappyPath()
    const { exitCode, stdout } = await runCommand(['--env', 'staging', '--dry-run'])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/ADMIN_SECRET/)
    expect(stdout).toMatch(/OPERATOR_PRIVATE_KEY/)
    expect(stdout).toMatch(/op:\/\/saga-staging\/saga-server-staging-admin-secret/)
    // Zero op or wrangler invocations:
    expect(execFileSync.mock.calls.length).toBe(0)
    expect(spawnSync.mock.calls.length).toBe(0)
  })

  it('refuses production env unless vault is saga-prod or saga-production', async () => {
    const { exitCode, stderr } = await runCommand([
      '--env',
      'production',
      '--vault',
      'saga-staging',
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/production secrets/i)
  })

  it('does NOT log secret values in any output', async () => {
    mockHappyPath()
    const { stdout, stderr } = await runCommand(['--env', 'staging'])
    expect(stdout).not.toMatch(/value-for-/)
    expect(stderr).not.toMatch(/value-for-/)
  })

  it('passes minimal env to wrangler subprocess (no leak of host env)', async () => {
    process.env.SOME_UNRELATED_SECRET = 'should-not-leak-12345'
    mockHappyPath()
    await runCommand(['--env', 'staging'])

    const wranglerCalls = spawnSync.mock.calls.filter(
      c =>
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === 'exec' &&
        (c[1] as string[])[1] === 'wrangler'
    )
    for (const call of wranglerCalls) {
      const opts = call[2] as { env: Record<string, string | undefined> }
      // Only the four allowlisted keys are forwarded.
      const keys = Object.keys(opts.env).sort()
      expect(keys).toEqual(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'HOME', 'PATH'].sort())
      expect(opts.env.SOME_UNRELATED_SECRET).toBeUndefined()
    }
    delete process.env.SOME_UNRELATED_SECRET
  })

  it('reports per-secret failure but continues processing other secrets', async () => {
    execFileSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList[0] === 'vault' && argList[1] === 'list') {
        return Buffer.from(JSON.stringify([{ name: 'saga-staging' }]))
      }
      return Buffer.from('')
    })

    let nthRead = 0
    spawnSync.mockImplementation((_cmd, args) => {
      const argList = args as string[]
      if (argList.includes('whoami')) return { status: 0, stdout: 'ok', stderr: '' }
      if (argList[0] === 'read') {
        nthRead++
        // First op read (admin-secret) hits a generic error (not a
        // recognized "missing item" string) -> fatal for that secret.
        if (nthRead === 1) {
          return { status: 1, stdout: '', stderr: 'network unreachable\n' }
        }
        return { status: 0, stdout: 'value-for-something\n', stderr: '' }
      }
      if (argList.includes('secret') && argList.includes('put')) {
        return { status: 0, stdout: 'ok', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    })

    const { exitCode, stdout } = await runCommand(['--env', 'staging'])
    expect(exitCode).toBe(1)
    // The other 4 secrets should still have been attempted (1 succeeded, 3 missing).
    expect(stdout).toMatch(/1 failed/)
  })
})
