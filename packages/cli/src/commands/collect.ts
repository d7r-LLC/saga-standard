// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createCollector, detectCollectors } from '@d7r/saga-collectors'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const collectCommand = new Command('collect')
  .description('Collect agent state from installed tools')
  .option('--source <name>', 'Collect from a specific source only')
  .option('--output <dir>', 'Output directory for partials', '.saga-partials')
  .action(async opts => {
    const spinner = ora('Detecting agent tools...').start()

    try {
      const detections = await detectCollectors()
      const available = detections.filter((d: { found: boolean }) => d.found)

      if (available.length === 0) {
        spinner.fail('No agent tools detected')
        console.log(chalk.yellow('Install Claude Code or OpenClaw to collect agent state.'))
        return
      }

      spinner.succeed(`Found ${available.length} agent tool(s)`)

      // Filter by source if specified
      const sources = opts.source
        ? available.filter((d: { source: string }) => d.source === opts.source)
        : available

      if (sources.length === 0) {
        console.error(chalk.red(`Source not found: ${opts.source}`))
        console.log(
          'Available sources:',
          available.map((d: { source: string }) => d.source).join(', ')
        )
        process.exit(1)
      }

      // Ensure output directory
      if (!existsSync(opts.output)) {
        mkdirSync(opts.output, { recursive: true })
      }

      for (const detection of sources) {
        const extractSpinner = ora(`Extracting from ${detection.source}...`).start()
        try {
          const collector = createCollector(detection.source)
          if (!collector) {
            extractSpinner.warn(`No collector for ${detection.source}`)
            continue
          }

          const partial = await collector.extract()
          const outPath = join(opts.output, `${detection.source}.json`)
          writeFileSync(outPath, JSON.stringify(partial, null, 2))

          const layerCount = Object.keys(partial.layers).length
          extractSpinner.succeed(`${detection.source}: ${layerCount} layers extracted → ${outPath}`)
        } catch (err) {
          extractSpinner.fail(`${detection.source}: ${(err as Error).message}`)
        }
      }
    } catch (err) {
      spinner.fail(`Collection failed: ${(err as Error).message}`)
      process.exit(1)
    }
  })
