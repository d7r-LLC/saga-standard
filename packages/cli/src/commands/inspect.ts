// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { extractSagaContainer, validateSagaDocument, validateSemantics } from '@d7r/saga-sdk'

export const inspectCommand = new Command('inspect')
  .description('Inspect a .saga container')
  .argument('<file>', 'Path to .saga file')
  .action(async file => {
    try {
      const bytes = readFileSync(file)
      const contents = await extractSagaContainer({ data: bytes })

      const doc = contents.document
      console.log(chalk.bold('SAGA Document'))
      console.log(`  ID:         ${doc.documentId}`)
      console.log(`  Version:    ${doc.sagaVersion}`)
      console.log(`  Export Type: ${doc.exportType}`)
      console.log(`  Exported:   ${doc.exportedAt}`)

      if (doc.signature) {
        console.log(chalk.bold('\nSignature'))
        console.log(`  Wallet:  ${doc.signature.walletAddress}`)
        console.log(`  Chain:   ${doc.signature.chain}`)
      }

      if (doc.layers) {
        console.log(chalk.bold('\nLayers'))
        for (const [name, layer] of Object.entries(doc.layers)) {
          if (!layer) continue
          const size = JSON.stringify(layer).length
          console.log(`  ${name}: ${formatBytes(size)}`)
        }
      }

      if (contents.meta) {
        console.log(chalk.bold('\nContainer'))
        console.log(`  Checksums: ${contents.meta.checksums?.length ?? 0} files`)
      }
    } catch (err) {
      console.error(chalk.red(`Failed to inspect: ${(err as Error).message}`))
      process.exit(1)
    }
  })

export const verifyCommand = new Command('verify')
  .description('Verify a .saga container')
  .argument('<file>', 'Path to .saga file')
  .action(async file => {
    try {
      const bytes = readFileSync(file)
      const contents = await extractSagaContainer({ data: bytes })
      const doc = contents.document

      console.log(chalk.bold(`Verifying: ${doc.documentId}`))

      // Schema validation
      const schemaResult = validateSagaDocument(doc)
      const sErrors = schemaResult.valid
        ? []
        : schemaResult.errors.filter(e => e.severity === 'error')
      if (sErrors.length > 0) {
        console.log(chalk.red(`  Schema:    FAIL (${sErrors.length} errors)`))
        for (const err of sErrors) {
          console.log(chalk.red(`    ${err.path}: ${err.message}`))
        }
      } else {
        console.log(chalk.green('  Schema:    PASS'))
      }

      // Semantic validation
      const semanticResult = validateSemantics(doc)
      const semErrors = semanticResult.valid
        ? []
        : semanticResult.errors.filter(e => e.severity === 'error')
      if (semErrors.length > 0) {
        console.log(chalk.red(`  Semantics: FAIL (${semErrors.length} errors)`))
        for (const err of semErrors) {
          console.log(chalk.red(`    ${err.path}: ${err.message}`))
        }
      } else {
        console.log(chalk.green('  Semantics: PASS'))
      }

      // Signature check
      if (doc.signature?.sig) {
        console.log(chalk.green(`  Signature: Present (${doc.signature.walletAddress})`))
      } else {
        console.log(chalk.yellow('  Signature: Missing'))
      }

      const totalErrors = sErrors.length + semErrors.length
      if (totalErrors > 0) {
        console.log(chalk.red(`\n${totalErrors} error(s) found`))
        process.exit(1)
      } else {
        console.log(chalk.green('\nAll checks passed'))
      }
    } catch (err) {
      console.error(chalk.red(`Verification failed: ${(err as Error).message}`))
      process.exit(1)
    }
  })

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
