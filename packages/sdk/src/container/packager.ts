// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createHash } from 'node:crypto'
import archiver from 'archiver'
import type { SagaSigner } from '../sign/signer'
import type { SagaDocument } from '../types/saga-document'

export interface PackOptions {
  document: SagaDocument
  memoryBinaries?: { longterm?: Buffer; episodic?: Buffer }
  artifacts?: Array<{ name: string; data: Buffer }>
  signer: SagaSigner
}

export interface MetaFile {
  sagaContainerVersion: string
  createdAt: string
  checksums: Record<string, string>
}

/**
 * Pack a SAGA document and optional binaries into a .saga ZIP container.
 * Layout per Appendix C:
 *   agent.saga.json
 *   memory/longterm.bin      (optional)
 *   memory/episodic.jsonl    (optional)
 *   artifacts/*              (optional)
 *   META
 *   SIGNATURE
 */
export async function packSagaContainer(options: PackOptions): Promise<Buffer> {
  const { document, memoryBinaries, artifacts } = options
  const checksums: Record<string, string> = {}

  // Prepare file contents
  const docJson = Buffer.from(JSON.stringify(document, null, 2))
  checksums['agent.saga.json'] = sha256Hex(docJson)

  const files: Array<{ name: string; data: Buffer }> = [{ name: 'agent.saga.json', data: docJson }]

  if (memoryBinaries?.longterm) {
    checksums['memory/longterm.bin'] = sha256Hex(memoryBinaries.longterm)
    files.push({ name: 'memory/longterm.bin', data: memoryBinaries.longterm })
  }

  if (memoryBinaries?.episodic) {
    checksums['memory/episodic.jsonl'] = sha256Hex(memoryBinaries.episodic)
    files.push({ name: 'memory/episodic.jsonl', data: memoryBinaries.episodic })
  }

  if (artifacts) {
    for (const artifact of artifacts) {
      const path = `artifacts/${artifact.name}`
      checksums[path] = sha256Hex(artifact.data)
      files.push({ name: path, data: artifact.data })
    }
  }

  // Create META
  const meta: MetaFile = {
    sagaContainerVersion: '1.0',
    createdAt: new Date().toISOString(),
    checksums,
  }
  const metaBuffer = Buffer.from(JSON.stringify(meta, null, 2))
  files.push({ name: 'META', data: metaBuffer })

  // Create SIGNATURE: sign the SHA-256 of all files concatenated
  const allContentHash = sha256Hex(Buffer.concat(files.map(f => f.data)))
  const sig = await options.signer.signConsent({
    operationType: 'transfer',
    documentId: document.documentId,
    destinationUrl: `container:${allContentHash}`,
    timestamp: new Date().toISOString(),
  })
  const signatureContent = JSON.stringify(
    {
      contentHash: allContentHash,
      sig,
      walletAddress: await options.signer.getAddress(),
      chain: options.signer.getChain(),
    },
    null,
    2
  )
  files.push({ name: 'SIGNATURE', data: Buffer.from(signatureContent) })

  // Create ZIP
  return createZip(files)
}

function sha256Hex(data: Buffer): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`
}

function createZip(files: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []

    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    for (const file of files) {
      archive.append(file.data, { name: file.name })
    }

    archive.finalize()
  })
}
