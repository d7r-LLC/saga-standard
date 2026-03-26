// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  handle: text('handle').unique().notNull(),
  walletAddress: text('wallet_address').notNull(),
  chain: text('chain').notNull(),
  publicKey: text('public_key'),
  registeredAt: text('registered_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  // NFT identity fields (null for legacy off-chain registrations)
  tokenId: integer('token_id'),
  tbaAddress: text('tba_address'),
  contractAddress: text('contract_address'),
  mintTxHash: text('mint_tx_hash'),
  entityType: text('entity_type').default('agent'),
  homeHubUrl: text('home_hub_url'),
})

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  handle: text('handle').unique().notNull(),
  name: text('name').notNull(),
  walletAddress: text('wallet_address').notNull(),
  chain: text('chain').notNull(),
  publicKey: text('public_key'),
  tokenId: integer('token_id'),
  tbaAddress: text('tba_address'),
  contractAddress: text('contract_address'),
  mintTxHash: text('mint_tx_hash'),
  registeredAt: text('registered_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  exportType: text('export_type').notNull(),
  sagaVersion: text('saga_version').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksum: text('checksum').notNull(),
  createdAt: text('created_at').notNull(),
})

export const transfers = sqliteTable('transfers', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  sourceServerUrl: text('source_server_url').notNull(),
  destinationServerUrl: text('destination_server_url').notNull(),
  status: text('status').notNull(),
  requestedLayers: text('requested_layers'), // JSON array
  consentSignature: text('consent_signature'),
  documentId: text('document_id').references(() => documents.id),
  initiatedAt: text('initiated_at').notNull(),
  completedAt: text('completed_at'),
})

export const authChallenges = sqliteTable('auth_challenges', {
  id: text('id').primaryKey(),
  walletAddress: text('wallet_address').notNull(),
  chain: text('chain').notNull(),
  challenge: text('challenge').notNull(),
  expiresAt: text('expires_at').notNull(),
  used: integer('used').default(0),
})

export const memoryEnvelopes = sqliteTable('memory_envelopes', {
  id: text('id').primaryKey(),
  agentHandle: text('agent_handle').notNull(),
  envelopeJson: text('envelope_json').notNull(),
  storedAt: text('stored_at').notNull(),
  envelopeTs: text('envelope_ts').notNull(),
})

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id').notNull(),
    handle: text('handle').notNull(),
    addedAt: text('added_at').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.groupId, table.handle] }),
  })
)

export const replicationPolicies = sqliteTable('replication_policies', {
  orgId: text('org_id').primaryKey(),
  policyJson: text('policy_json').notNull(),
  updatedAt: text('updated_at').notNull(),
})
