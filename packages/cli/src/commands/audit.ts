// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { bundleRepo } from '../lib/repo-bundler'
import { PRESETS, getPreset } from '../lib/audit-presets'
import { type Provider, streamCompletion } from '../lib/llm-stream'

/**
 * Load environment variables from a .env-style file in process.cwd().
 * Mirrors the pattern used by `saga deploy` for OP_SERVICE_ACCOUNT_TOKEN.
 * Existing env vars are NOT overwritten.
 */
function loadDotEnv(envPath: string): void {
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export const auditCommand = new Command('audit')
  .description(
    'Bundle the entire repo and send to an LLM for analysis (security audit, gap analysis, architecture review).'
  )
  .option('--target <path>', 'Repo or subdirectory to bundle', '.')
  .option('--preset <name>', `Use a built-in preset (${Object.keys(PRESETS).join(', ')})`)
  .option('--prompt <text>', 'Custom user prompt (overrides preset)')
  .option('--prompt-file <path>', 'Read user prompt from a file')
  .option('--system <text>', 'Custom system prompt (overrides preset)')
  .option('--system-file <path>', 'Read system prompt from a file')
  .option('--provider <name>', 'LLM provider: anthropic | openai | gemini', 'anthropic')
  .option('--model <id>', 'Model ID (defaults: claude-opus-4-7 / gpt-4o / gemini-2.5-pro)')
  .option('--max-tokens <n>', 'Max output tokens', '16000')
  .option(
    '--max-input-tokens <n>',
    'Soft cap on bundled input tokens (abort if exceeded)',
    '900000'
  )
  .option(
    '--include <pattern>',
    'Include path substring (repeatable, narrows the bundle)',
    (val: string, prev: string[] = []) => [...prev, val],
    []
  )
  .option(
    '--exclude <pattern>',
    'Exclude path substring (repeatable, in addition to defaults)',
    (val: string, prev: string[] = []) => [...prev, val],
    []
  )
  .option(
    '--ext <list>',
    'Comma-separated list of file extensions to include (overrides default set)'
  )
  .option('--dry-run', 'Print bundle stats and the first/last lines, skip API call')
  .option('--out-dir <path>', 'Where to save prompt + response', 'audits')
  .option('--no-save', 'Do not write prompt/response files; stream-only')
  .action(async opts => {
    // ── Auto-load env vars from common .env locations ─────────────────────
    loadDotEnv(join(process.cwd(), '.env'))
    loadDotEnv(join(process.cwd(), '.dev.vars'))

    const provider = opts.provider as Provider
    if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'gemini') {
      console.error(
        chalk.red(`Unknown provider: ${provider} (expected anthropic | openai | gemini)`)
      )
      process.exit(1)
    }

    const defaultModels: Record<Provider, string> = {
      anthropic: 'claude-opus-4-7',
      openai: 'gpt-4o',
      gemini: 'gemini-2.5-pro',
    }
    const model = opts.model ?? defaultModels[provider]

    // ── Resolve prompts ───────────────────────────────────────────────────
    const preset = opts.preset ? getPreset(opts.preset) : null

    let userPrompt: string | undefined = opts.prompt
    if (!userPrompt && opts.promptFile) {
      userPrompt = readFileSync(resolve(opts.promptFile), 'utf-8').trim()
    }
    if (!userPrompt && preset) userPrompt = preset.userPromptTemplate

    let systemPrompt: string | undefined = opts.system
    if (!systemPrompt && opts.systemFile) {
      systemPrompt = readFileSync(resolve(opts.systemFile), 'utf-8').trim()
    }
    if (!systemPrompt && preset) systemPrompt = preset.systemPrompt

    if (!userPrompt && !opts.dryRun) {
      console.error(
        chalk.red(
          'A user prompt is required. Provide one with --preset, --prompt, or --prompt-file.'
        )
      )
      console.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`)
      process.exit(1)
    }

    // ── Bundle the repo ───────────────────────────────────────────────────
    const root = resolve(opts.target)
    if (!existsSync(root)) {
      console.error(chalk.red(`Target does not exist: ${root}`))
      process.exit(1)
    }

    const extensions = opts.ext
      ? (opts.ext as string)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : undefined

    console.error(chalk.dim(`[audit] bundling ${root} ...`))
    const {
      text: bundle,
      stats,
      manifest,
    } = bundleRepo({
      root,
      include: opts.include,
      exclude: opts.exclude,
      extensions,
    })

    console.error(
      chalk.dim(
        `[audit] ${stats.filesIncluded} files included, ${stats.filesSkipped} skipped, ${formatBytes(stats.bytes)} (~${stats.estimatedTokens.toLocaleString()} tokens)`
      )
    )
    console.error(chalk.dim(`[audit] top packages by size:`))
    for (const pkg of stats.topPackages) {
      console.error(chalk.dim(`         ${pkg.path.padEnd(40)} ${formatBytes(pkg.bytes)}`))
    }

    // ── Compose final user prompt ─────────────────────────────────────────
    const fullUserPrompt = userPrompt
      ? `<repo>\n${bundle}\n</repo>\n\n${userPrompt}`
      : `<repo>\n${bundle}\n</repo>`

    // ── Dry run: print stats + a preview, exit ────────────────────────────
    if (opts.dryRun) {
      console.error(chalk.yellow('[audit] --dry-run: skipping API call'))
      console.error(
        chalk.dim(
          `[audit] system prompt: ${systemPrompt ? `${systemPrompt.length} chars` : '(none)'}`
        )
      )
      console.error(
        chalk.dim(`[audit] user prompt:   ${userPrompt ? `${userPrompt.length} chars` : '(none)'}`)
      )
      console.error(chalk.dim(`[audit] full payload:  ${fullUserPrompt.length} chars`))
      console.error(chalk.dim('[audit] top 25 files by size:'))
      const included = manifest
        .filter(m => !m.reason)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 25)
      for (const m of included) {
        console.error(chalk.dim(`         ${formatBytes(m.bytes).padStart(10)}  ${m.path}`))
      }
      // Always write manifest on dry-run so the user can grep/inspect
      const dryManifestPath = resolve(opts.outDir, 'last-dry-run-manifest.json')
      mkdirSync(resolve(opts.outDir), { recursive: true })
      writeFileSync(dryManifestPath, JSON.stringify({ stats, manifest, target: root }, null, 2))
      console.error(chalk.dim(`[audit] full manifest written to ${dryManifestPath}`))
      return
    }

    // ── Token-budget guard (only for live calls) ─────────────────────────
    const maxInputTokens = Number(opts.maxInputTokens)
    if (stats.estimatedTokens > maxInputTokens) {
      console.error(
        chalk.red(
          `[audit] estimated input tokens (${stats.estimatedTokens.toLocaleString()}) exceed --max-input-tokens (${maxInputTokens.toLocaleString()})`
        )
      )
      console.error(
        'Add `--exclude <pattern>` flags to shrink the bundle, or `--target <subpath>` to scope down. Run with `--dry-run` to inspect what got bundled.'
      )
      process.exit(1)
    }

    // ── Resolve API key ───────────────────────────────────────────────────
    const keyEnvVars: Record<Provider, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY',
    }
    const varName = keyEnvVars[provider]
    const apiKey = process.env[varName]
    if (!apiKey) {
      console.error(chalk.red(`${varName} not found in environment or saga-standard/.env`))
      process.exit(1)
    }

    // ── Call the API, streaming ───────────────────────────────────────────
    console.error(
      chalk.dim(`[audit] calling ${provider} ${model} (max output ${opts.maxTokens} tokens)`)
    )
    console.error('')
    const t0 = Date.now()
    const result = await streamCompletion({
      provider,
      model,
      apiKey,
      systemPrompt,
      userPrompt: fullUserPrompt,
      maxTokens: Number(opts.maxTokens),
      onDelta: t => process.stdout.write(t),
    })
    const elapsedMs = Date.now() - t0
    process.stdout.write('\n')
    console.error('')
    console.error(
      chalk.dim(
        `[audit] completed in ${(elapsedMs / 1000).toFixed(1)}s — input ${result.usage?.inputTokens?.toLocaleString() ?? '?'} / output ${result.usage?.outputTokens?.toLocaleString() ?? '?'} tokens`
      )
    )

    // ── Save artifacts ────────────────────────────────────────────────────
    if (opts.save === false) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const slug =
      opts.preset ?? (userPrompt ? slugify(userPrompt.split('\n')[0] ?? 'audit') : 'audit')
    const outDir = resolve(opts.outDir, `${timestamp}__${slug}`)
    mkdirSync(outDir, { recursive: true })

    const meta = [
      `# Audit run`,
      ``,
      `**Provider:** ${provider}`,
      `**Model:** ${model}`,
      `**Date:** ${new Date().toISOString()}`,
      `**Target:** ${root}`,
      `**Preset:** ${opts.preset ?? '(custom)'}`,
      `**Files included:** ${stats.filesIncluded}`,
      `**Files skipped:** ${stats.filesSkipped}`,
      `**Bundle size:** ${formatBytes(stats.bytes)}`,
      `**Estimated input tokens:** ${stats.estimatedTokens.toLocaleString()}`,
      `**Reported input tokens:** ${result.usage?.inputTokens?.toLocaleString() ?? '?'}`,
      `**Reported output tokens:** ${result.usage?.outputTokens?.toLocaleString() ?? '?'}`,
      `**Elapsed:** ${(elapsedMs / 1000).toFixed(1)}s`,
      ``,
      `## System prompt`,
      ``,
      systemPrompt ?? '(none)',
      ``,
      `## User prompt`,
      ``,
      userPrompt ?? '(none)',
      ``,
    ].join('\n')

    writeFileSync(join(outDir, 'prompt.md'), meta)
    writeFileSync(join(outDir, 'response.md'), result.text)
    writeFileSync(
      join(outDir, 'manifest.json'),
      JSON.stringify({ stats, manifest, model, provider, target: root }, null, 2)
    )

    console.error(chalk.green(`[audit] saved to ${outDir}`))
  })
