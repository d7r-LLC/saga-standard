// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import Realm from 'realm'
import { ALL_SCHEMAS } from './realm-schemas'

let realmInstance: Realm | null = null

export const RealmStore = {
  async open(encryptionKey?: ArrayBuffer): Promise<Realm> {
    if (realmInstance && !realmInstance.isClosed) {
      return realmInstance
    }

    const config: Realm.Configuration = {
      schema: ALL_SCHEMAS,
      schemaVersion: 2,
      onMigration: (oldRealm: Realm, newRealm: Realm) => {
        if (oldRealm.schemaVersion < 2) {
          const wallets = newRealm.objects('Wallet')
          for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i] as Record<string, unknown>
            if (!wallet.derivationPath) {
              wallet.derivationPath = ''
            }
          }
        }
      },
      ...(encryptionKey ? { encryptionKey: new Int8Array(encryptionKey) } : {}),
    }

    realmInstance = await Realm.open(config)
    return realmInstance
  },

  close(): void {
    if (realmInstance && !realmInstance.isClosed) {
      realmInstance.close()
      realmInstance = null
    }
  },

  getInstance(): Realm {
    if (!realmInstance || realmInstance.isClosed) {
      throw new Error('Realm not open. Call RealmStore.open() first.')
    }
    return realmInstance
  },

  write<T>(callback: () => T): T {
    const realm = this.getInstance()
    return realm.write(callback)
  },

  query<T extends Realm.Object<T>>(schemaName: string): Realm.Results<T> {
    const realm = this.getInstance()
    return realm.objects<T>(schemaName)
  },
}
