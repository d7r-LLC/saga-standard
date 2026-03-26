// packages/server/src/__tests__/relay-test-helpers.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'

/** Mock WebSocket with inspectable sent messages */
export interface MockWebSocket extends WebSocket {
  _sent: string[]
  _closed: boolean
  _closeCode?: number
  _closeReason?: string
  _attachment: unknown
}

export function createMockWebSocket(): MockWebSocket {
  const sent: string[] = []
  let closed = false
  let closeCode: number | undefined
  let closeReason: string | undefined
  let attachment: unknown = undefined

  return {
    send(msg: string | ArrayBuffer) {
      sent.push(typeof msg === 'string' ? msg : '[binary]')
    },
    close(code?: number, reason?: string) {
      closed = true
      closeCode = code
      closeReason = reason
    },
    serializeAttachment(value: unknown) {
      attachment = structuredClone(value)
    },
    deserializeAttachment() {
      return attachment
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true
    },
    get _sent() {
      return sent
    },
    get _closed() {
      return closed
    },
    get _closeCode() {
      return closeCode
    },
    get _closeReason() {
      return closeReason
    },
    get _attachment() {
      return attachment
    },
    // Stub remaining WebSocket interface properties
    readyState: 1,
    bufferedAmount: 0,
    extensions: '',
    protocol: '',
    url: '',
    binaryType: 'blob' as BinaryType,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  } as unknown as MockWebSocket
}

/** Mock DurableObjectState for testing RelayRoom */
export function createMockDurableObjectState() {
  const websockets: WebSocket[] = []
  const storage = new Map<string, unknown>()
  let alarm: number | null = null

  return {
    id: { toString: () => 'test-do-id' } as DurableObjectId,
    acceptWebSocket(ws: WebSocket, _tags?: string[]) {
      websockets.push(ws)
    },
    getWebSockets(_tag?: string): WebSocket[] {
      return [...websockets]
    },
    storage: {
      get: async (key: string) => storage.get(key) ?? null,
      put: async (key: string, value: unknown) => {
        storage.set(key, value)
      },
      delete: async (key: string) => {
        storage.delete(key)
        return true
      },
      setAlarm: async (time: number | Date) => {
        alarm = typeof time === 'number' ? time : time.getTime()
      },
      getAlarm: async () => alarm,
      deleteAlarm: async () => {
        alarm = null
      },
      list: async () => new Map(storage),
    },
    // Expose for test inspection
    _websockets: websockets,
    _storage: storage,
    _getAlarm: () => alarm,
  } as unknown as DurableObjectState & {
    _websockets: WebSocket[]
    _storage: Map<string, unknown>
    _getAlarm: () => number | null
  }
}

/** Create a mock Env with RELAY_MAILBOX for DO testing */
export async function createRelayMockEnv(): Promise<Env> {
  const db = createMockD1()
  await runMigrations(db)
  return {
    DB: db,
    STORAGE: {} as unknown as R2Bucket,
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as unknown as DurableObjectNamespace,
    SERVER_NAME: 'Test SAGA Server',
  }
}
