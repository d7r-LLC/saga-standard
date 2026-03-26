// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { WalletSigner, WebSocketLike } from '../types'

/**
 * Mock WebSocket for testing relay connection protocol.
 * Simulates server behavior via simulateXxx() methods.
 */
export class MockWebSocket implements WebSocketLike {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  /** Raw strings sent by the client */
  sent: string[] = []

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' } as CloseEvent)
  }

  // ── Simulation helpers ──

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({} as Event)
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }

  simulateClose(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  simulateError(): void {
    this.onerror?.({} as Event)
  }

  /** Last message sent by the client, parsed as JSON */
  lastSent<T = unknown>(): T {
    if (this.sent.length === 0) throw new Error('No messages sent')
    return JSON.parse(this.sent[this.sent.length - 1]) as T
  }

  /** All messages sent by the client, parsed as JSON */
  allSent<T = unknown>(): T[] {
    return this.sent.map(s => JSON.parse(s) as T)
  }
}

/** Create a mock WalletSigner for testing */
export function createMockSigner(overrides?: Partial<WalletSigner>): WalletSigner {
  return {
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    chain: 'eip155:8453',
    sign: vi.fn().mockResolvedValue('0xmocksignature'),
    ...overrides,
  }
}

/**
 * Simulate the server-side auth flow on a MockWebSocket.
 *
 * 1. Calls ws.simulateOpen()
 * 2. Sends auth:challenge
 * 3. Waits for client to send auth:verify
 * 4. Sends auth:success
 *
 * Returns after auth:success so the connection is authenticated.
 */
export async function simulateAuthFlow(ws: MockWebSocket, handle = 'alice'): Promise<void> {
  ws.simulateOpen()

  ws.simulateMessage({
    type: 'auth:challenge',
    challenge: 'saga-relay:test-uuid:1234567890',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  })

  // Let the signer.sign() microtask resolve
  await vi.waitFor(() => {
    const msgs = ws.allSent()
    const hasVerify = msgs.some(
      (m: unknown) => (m as Record<string, unknown>).type === 'auth:verify'
    )
    if (!hasVerify) throw new Error('Waiting for auth:verify')
  })

  ws.simulateMessage({ type: 'auth:success', handle })

  // Let the auth:success handler settle
  await vi.waitFor(() => {
    const msgs = ws.allSent()
    const hasDrain = msgs.some(
      (m: unknown) => (m as Record<string, unknown>).type === 'mailbox:drain'
    )
    if (!hasDrain) throw new Error('Waiting for mailbox:drain')
  })
}
