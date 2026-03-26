// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import type { AgentRecord, DocumentRecord } from '@epicdm/saga-client'

export function ProfileDetails({
  agent,
  latestDocument,
}: {
  agent: AgentRecord
  latestDocument?: DocumentRecord
}) {
  const nftFields = [
    agent.tokenId != null && { label: 'Token ID', value: `#${agent.tokenId}` },
    agent.tbaAddress && { label: 'TBA Address', value: agent.tbaAddress },
    agent.contractAddress && {
      label: 'Contract',
      value: agent.contractAddress,
    },
    agent.mintTxHash && { label: 'Mint TX', value: agent.mintTxHash },
    agent.homeHubUrl && { label: 'Home Hub', value: agent.homeHubUrl },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="space-y-6">
      {nftFields.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            On-Chain Identity
          </h2>
          <dl className="mt-3 space-y-2">
            {nftFields.map((field) => (
              <div key={field.label} className="flex gap-2 text-sm">
                <dt className="shrink-0 font-medium text-slate-500 dark:text-slate-400">
                  {field.label}:
                </dt>
                <dd className="truncate font-mono text-slate-700 dark:text-slate-300">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {latestDocument && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Latest Document
          </h2>
          <div className="mt-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">
                  Type:{' '}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {latestDocument.exportType}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">
                  Version:{' '}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {latestDocument.sagaVersion}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">
                  Size:{' '}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {(latestDocument.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">
                  Uploaded:{' '}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {new Date(latestDocument.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Registration
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Registered {new Date(agent.registeredAt).toLocaleDateString()}
        </p>
      </section>
    </div>
  )
}
