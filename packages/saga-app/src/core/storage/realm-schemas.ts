// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import Realm from 'realm'

export class WalletRecord extends Realm.Object<WalletRecord> {
  id!: string
  type!: 'self-custody' | 'managed'
  label!: string
  address!: string
  chain!: string
  balance!: string
  lastSync!: number
  derivationPath!: string

  static schema: Realm.ObjectSchema = {
    name: 'Wallet',
    primaryKey: 'id',
    properties: {
      id: 'string',
      type: 'string',
      label: 'string',
      address: 'string',
      chain: 'string',
      balance: { type: 'string', default: '0' },
      lastSync: { type: 'int', default: 0 },
      derivationPath: { type: 'string', default: '' },
    },
  }
}

export class IdentityRecord extends Realm.Object<IdentityRecord> {
  id!: string
  type!: 'agent' | 'org' | 'directory'
  handle!: string
  tokenId!: string
  contractAddress!: string
  tbaAddress!: string
  hubUrl!: string
  metadata!: string

  static schema: Realm.ObjectSchema = {
    name: 'Identity',
    primaryKey: 'id',
    properties: {
      id: 'string',
      type: 'string',
      handle: 'string',
      tokenId: { type: 'string', default: '' },
      contractAddress: { type: 'string', default: '' },
      tbaAddress: { type: 'string', default: '' },
      hubUrl: { type: 'string', default: '' },
      metadata: { type: 'string', default: '{}' },
    },
  }
}

export class MessageRecord extends Realm.Object<MessageRecord> {
  id!: string
  conversationId!: string
  from!: string
  to!: string
  scope!: string
  ciphertext!: string
  timestamp!: number
  status!: 'sent' | 'delivered' | 'read'

  static schema: Realm.ObjectSchema = {
    name: 'Message',
    primaryKey: 'id',
    properties: {
      id: 'string',
      conversationId: 'string',
      from: 'string',
      to: 'string',
      scope: 'string',
      ciphertext: 'string',
      timestamp: 'int',
      status: { type: 'string', default: 'sent' },
    },
  }
}

export class DocumentRecord extends Realm.Object<DocumentRecord> {
  id!: string
  agentHandle!: string
  exportType!: string
  sagaVersion!: string
  sizeBytes!: number
  checksum!: string
  createdAt!: number

  static schema: Realm.ObjectSchema = {
    name: 'Document',
    primaryKey: 'id',
    properties: {
      id: 'string',
      agentHandle: 'string',
      exportType: 'string',
      sagaVersion: 'string',
      sizeBytes: { type: 'int', default: 0 },
      checksum: { type: 'string', default: '' },
      createdAt: 'int',
    },
  }
}

export class SubscriptionRecord extends Realm.Object<SubscriptionRecord> {
  id!: string
  tenantId!: string
  hubUrl!: string
  plan!: string
  status!: 'active' | 'suspended' | 'expired'
  periodEnd!: number

  static schema: Realm.ObjectSchema = {
    name: 'Subscription',
    primaryKey: 'id',
    properties: {
      id: 'string',
      tenantId: 'string',
      hubUrl: 'string',
      plan: 'string',
      status: 'string',
      periodEnd: 'int',
    },
  }
}

export class GroupRecord extends Realm.Object<GroupRecord> {
  id!: string
  name!: string
  groupKeyId!: string
  lastActivity!: number

  static schema: Realm.ObjectSchema = {
    name: 'Group',
    primaryKey: 'id',
    properties: {
      id: 'string',
      name: 'string',
      groupKeyId: { type: 'string', default: '' },
      lastActivity: { type: 'int', default: 0 },
    },
  }
}

export const ALL_SCHEMAS = [
  WalletRecord,
  IdentityRecord,
  MessageRecord,
  DocumentRecord,
  SubscriptionRecord,
  GroupRecord,
]
