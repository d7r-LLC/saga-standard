> **FlowState Document:** `docu_1zW88j_TQM`

# Phase 3: On-Chain Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can mint identity NFTs (Agent or Org), register handles, create TBAs (ERC-6551), and manage their on-chain identity from the app's Profile tab.

**Architecture:** New `src/features/identity/` feature module following the established pattern. A `ChainProvider` wraps viem public + wallet clients for Base / Base Sepolia with network switching. Identity operations use `@d7r/saga-client` for minting/resolving (which wraps `@saga-standard/contracts` ABIs and addresses). Minted identities persist to Realm via StorageProvider. Mint wizard is a multi-step flow inside the ProfileStack. The existing Badge component already supports `agent` / `org` / `directory` variants.

**Tech Stack:** viem (chain interaction), @d7r/saga-client (mintAgentIdentity, mintOrgIdentity, resolveHandleOnChain, isHandleAvailable), @saga-standard/contracts (ABIs, addresses, computeTBAAddress, types)

---

## File Structure

```
packages/saga-app/src/features/identity/
├── types.ts                        # IdentityData, MintParams, HandleStatus types
├── chain.ts                        # Chain helpers wrapping @d7r/saga-client
├── hooks/
│   ├── useIdentity.ts              # Identity list, active identity, CRUD
│   ├── useMint.ts                  # Mint flow state machine (check → sign → confirm)
│   └── useHandle.ts                # Handle availability check + resolution
├── screens/
│   ├── IdentityManager.tsx         # List owned identities, MintNew action
│   ├── MintWizard.tsx              # Multi-step mint: type → handle → confirm → result
│   ├── IdentityDetail.tsx          # Single identity: handle, TBA, hub URL, NFT info
│   └── HandleManager.tsx           # View registered handles, update home hub URL
└── components/
    ├── IdentityCard.tsx            # Identity summary card (handle, type badge, TBA)
    └── HandleChecker.tsx           # Real-time handle availability input
```

```
packages/saga-app/src/core/
├── providers/
│   └── ChainProvider.tsx           # viem public/wallet clients, network switching
└── chain/
    └── config.ts                   # Contract addresses, chain configs, TBA constants
```

**Modified existing files:**

- `src/navigation/types.ts` — Add IdentityManager, MintWizard, IdentityDetail, HandleManager to ProfileStackParamList
- `src/navigation/stacks/ProfileStack.tsx` — Register new screens, replace placeholder with IdentityManager
- `src/core/providers/StorageProvider.tsx` — Add Realm-backed identity persistence (addIdentity, deleteIdentity write to Realm)
- `src/core/storage/realm-schemas.ts` — No schema changes needed (IdentityRecord already exists)
- `src/core/storage/realm-store.ts` — No changes needed (schemaVersion stays at 2)
- `src/App.tsx` — Wrap with ChainProvider
- `jest.config.js` — Add @saga-standard/contracts, @d7r/saga-client to transformIgnorePatterns if needed
- `package.json` — Add @d7r/saga-client, @saga-standard/contracts workspace dependencies

**Test files:**

- `__tests__/features/identity/chain.test.ts`
- `__tests__/features/identity/hooks/useMint.test.tsx`
- `__tests__/features/identity/hooks/useHandle.test.tsx`
- `__tests__/features/identity/hooks/useIdentity.test.tsx`
- `__tests__/core/providers/ChainProvider.test.tsx`

---

### Task 1: Dependencies and Identity Feature Scaffold

**Files:**

- Modify: `packages/saga-app/package.json`
- Modify: `packages/saga-app/jest.config.js`
- Create: `packages/saga-app/src/features/identity/types.ts`

- [ ] **Step 1: Add workspace dependencies**

Add `@d7r/saga-client` and `@saga-standard/contracts` to package.json:

```bash
cd packages/saga-app
pnpm add @d7r/saga-client@workspace:* @saga-standard/contracts@workspace:*
```

- [ ] **Step 2: Update jest.config.js transformIgnorePatterns**

Add `@epicdm|@saga-standard` to the existing transformIgnorePatterns regex. The current pattern is:

```js
transformIgnorePatterns: [
  '/node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-reanimated|react-native-drawer-layout|react-native-qrcode-svg|react-native-svg|viem|@scure|@noble|@react-native-clipboard)/)',
],
```

Add `@epicdm|@saga-standard` to the list:

```js
transformIgnorePatterns: [
  '/node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-reanimated|react-native-drawer-layout|react-native-qrcode-svg|react-native-svg|viem|@scure|@noble|@react-native-clipboard|@epicdm|@saga-standard)/)',
],
```

- [ ] **Step 3: Create identity types**

Create `src/features/identity/types.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export type EntityType = 'agent' | 'org' | 'directory'

export interface IdentityData {
  id: string
  type: EntityType
  handle: string
  tokenId: string
  contractAddress: string
  tbaAddress: string
  hubUrl: string
}

export interface MintAgentParams {
  handle: string
  homeHubUrl: string
}

export interface MintOrgParams {
  handle: string
  name: string
}

export type MintStep = 'type' | 'handle' | 'confirm' | 'minting' | 'done' | 'error'

export interface MintState {
  step: MintStep
  entityType: EntityType | null
  handle: string
  orgName: string
  hubUrl: string
  error: string | null
  txHash: string | null
  tokenId: string | null
  tbaAddress: string | null
}

export interface HandleStatus {
  handle: string
  available: boolean | null
  checking: boolean
  error: string | null
}
```

- [ ] **Step 4: Run tests to verify no regressions**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All 44 existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/package.json packages/saga-app/jest.config.js packages/saga-app/src/features/identity/types.ts pnpm-lock.yaml
git commit -m "feat(saga-app): add identity dependencies and type scaffold for Phase 3

Built with d7r FlowState"
```

---

### Task 2: ChainProvider

**Files:**

- Create: `packages/saga-app/src/core/chain/config.ts`
- Create: `packages/saga-app/src/core/providers/ChainProvider.tsx`
- Modify: `packages/saga-app/src/App.tsx`
- Create: `packages/saga-app/__tests__/core/providers/ChainProvider.test.tsx`

- [ ] **Step 1: Write the ChainProvider test**

Create `__tests__/core/providers/ChainProvider.test.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { ChainProvider, useChain } from '../../../src/core/providers/ChainProvider'

jest.mock('viem', () => ({
  createPublicClient: jest.fn().mockReturnValue({ chain: { id: 84532 } }),
  http: jest.fn().mockReturnValue({}),
}))

function TestConsumer() {
  const { chainId, publicClient } = useChain()
  return (
    <>
      <Text testID="chainId">{chainId}</Text>
      <Text testID="hasClient">{String(!!publicClient)}</Text>
    </>
  )
}

describe('ChainProvider', () => {
  it('provides default chain and public client', () => {
    const { getByTestId } = render(
      <ChainProvider>
        <TestConsumer />
      </ChainProvider>
    )

    expect(getByTestId('chainId').props.children).toBe('base-sepolia')
    expect(getByTestId('hasClient').props.children).toBe('true')
  })

  it('allows switching chain', () => {
    let switchFn: ((chain: string) => void) | null = null
    function SwitchConsumer() {
      const { chainId, setChainId } = useChain()
      switchFn = setChainId
      return <Text testID="chainId">{chainId}</Text>
    }

    const { getByTestId } = render(
      <ChainProvider>
        <SwitchConsumer />
      </ChainProvider>
    )

    expect(getByTestId('chainId').props.children).toBe('base-sepolia')

    act(() => {
      switchFn?.('base')
    })

    expect(getByTestId('chainId').props.children).toBe('base')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="ChainProvider"`
Expected: FAIL — module not found.

- [ ] **Step 3: Create chain config**

Create `src/core/chain/config.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Chain } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import type { ChainId } from '../../features/wallet/types'

export const CHAINS: Record<ChainId, Chain> = {
  base,
  'base-sepolia': baseSepolia,
}

export const RPC_URLS: Record<ChainId, string> = {
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
}

export const DEFAULT_CHAIN_ID: ChainId = 'base-sepolia'

/** ERC-6551 TBA implementation address (same across all chains) */
export const TBA_IMPLEMENTATION = '0x55266d75D1a14E4572138116aF39863Ed6596E7F' as const

/** Map ChainId to numeric chain ID */
export const CHAIN_IDS: Record<ChainId, number> = {
  base: 8453,
  'base-sepolia': 84532,
}
```

- [ ] **Step 4: Create ChainProvider**

Create `src/core/providers/ChainProvider.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPublicClient, http } from 'viem'
import type { PublicClient } from 'viem'
import type { ChainId } from '../../features/wallet/types'
import { CHAINS, DEFAULT_CHAIN_ID, RPC_URLS } from '../chain/config'

interface ChainContextValue {
  chainId: ChainId
  setChainId: (chainId: ChainId) => void
  publicClient: PublicClient
}

const ChainContext = createContext<ChainContextValue | null>(null)

export function useChain(): ChainContextValue {
  const context = useContext(ChainContext)
  if (!context) {
    throw new Error('useChain must be used within a ChainProvider')
  }
  return context
}

interface ChainProviderProps {
  children: React.ReactNode
}

export function ChainProvider({ children }: ChainProviderProps): React.JSX.Element {
  const [chainId, setChainIdState] = useState<ChainId>(DEFAULT_CHAIN_ID)

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: CHAINS[chainId],
        transport: http(RPC_URLS[chainId]),
      }),
    [chainId]
  )

  const setChainId = useCallback((id: ChainId) => {
    setChainIdState(id)
  }, [])

  const value: ChainContextValue = useMemo(
    () => ({ chainId, setChainId, publicClient }),
    [chainId, setChainId, publicClient]
  )

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}
```

- [ ] **Step 5: Wire ChainProvider into App.tsx**

Read `src/App.tsx` and add `<ChainProvider>` wrapping the navigation, inside `<StorageProvider>` and `<AuthProvider>`. The provider hierarchy should be:

```tsx
<StorageProvider>
  <AuthProvider>
    <ChainProvider>
      <Navigation />
    </ChainProvider>
  </AuthProvider>
</StorageProvider>
```

Add import: `import { ChainProvider } from './core/providers/ChainProvider'`

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All tests pass including new ChainProvider tests.

- [ ] **Step 7: Commit**

```bash
git add src/core/chain/config.ts src/core/providers/ChainProvider.tsx src/App.tsx __tests__/core/providers/ChainProvider.test.tsx
git commit -m "feat(saga-app): add ChainProvider with viem clients and network switching

Built with d7r FlowState"
```

---

### Task 3: Identity Chain Helpers

**Files:**

- Create: `packages/saga-app/src/features/identity/chain.ts`
- Create: `packages/saga-app/__tests__/features/identity/chain.test.ts`

These helpers wrap `@d7r/saga-client` functions to provide a simpler interface for the app's hooks.

- [ ] **Step 1: Write the chain helper tests**

Create `__tests__/features/identity/chain.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { checkHandleAvailability, resolveHandle } from '../../../src/features/identity/chain'

const mockIsHandleAvailable = jest.fn()
const mockResolveHandleOnChain = jest.fn()

jest.mock('@d7r/saga-client', () => ({
  isHandleAvailable: (...args: unknown[]) => mockIsHandleAvailable(...args),
  resolveHandleOnChain: (...args: unknown[]) => mockResolveHandleOnChain(...args),
}))

const mockPublicClient = {} as never

describe('identity chain helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('checkHandleAvailability returns true for available handle', async () => {
    mockIsHandleAvailable.mockResolvedValue(true)

    const result = await checkHandleAvailability('myhandle', mockPublicClient, 'base-sepolia')

    expect(result).toBe(true)
    expect(mockIsHandleAvailable).toHaveBeenCalledWith({
      handle: 'myhandle',
      publicClient: mockPublicClient,
      chain: 'base-sepolia',
    })
  })

  it('checkHandleAvailability returns false for taken handle', async () => {
    mockIsHandleAvailable.mockResolvedValue(false)

    const result = await checkHandleAvailability('taken', mockPublicClient, 'base-sepolia')

    expect(result).toBe(false)
  })

  it('resolveHandle returns entity data', async () => {
    mockResolveHandleOnChain.mockResolvedValue({
      entityType: 'AGENT',
      tokenId: BigInt(1),
      contractAddress: '0x1234',
    })

    const result = await resolveHandle('myhandle', mockPublicClient, 'base-sepolia')

    expect(result).toEqual({
      entityType: 'AGENT',
      tokenId: BigInt(1),
      contractAddress: '0x1234',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="identity/chain"`
Expected: FAIL — module not found.

- [ ] **Step 3: Create chain helpers**

Create `src/features/identity/chain.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { PublicClient, WalletClient } from 'viem'
import {
  isHandleAvailable,
  mintAgentIdentity,
  mintOrgIdentity,
  resolveHandleOnChain,
} from '@d7r/saga-client'
import type { MintResult, OnChainResolveResult, SupportedChain } from '@d7r/saga-client'
import type { ChainId } from '../wallet/types'

export type { MintResult, OnChainResolveResult }

export async function checkHandleAvailability(
  handle: string,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<boolean> {
  return isHandleAvailable({
    handle,
    publicClient,
    chain: chainId as SupportedChain,
  })
}

export async function resolveHandle(
  handle: string,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<OnChainResolveResult> {
  return resolveHandleOnChain({
    handle,
    publicClient,
    chain: chainId as SupportedChain,
  })
}

export async function mintAgent(
  handle: string,
  homeHubUrl: string,
  walletClient: WalletClient,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<MintResult> {
  return mintAgentIdentity({
    handle,
    homeHubUrl,
    walletClient,
    publicClient,
    chain: chainId as SupportedChain,
  })
}

export async function mintOrg(
  handle: string,
  name: string,
  walletClient: WalletClient,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<MintResult> {
  return mintOrgIdentity({
    handle,
    name,
    walletClient,
    publicClient,
    chain: chainId as SupportedChain,
  })
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="identity/chain"`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/features/identity/chain.ts __tests__/features/identity/chain.test.ts
git commit -m "feat(saga-app): add identity chain helpers wrapping saga-client

Built with d7r FlowState"
```

---

### Task 4: useHandle Hook

**Files:**

- Create: `packages/saga-app/src/features/identity/hooks/useHandle.ts`
- Create: `packages/saga-app/__tests__/features/identity/hooks/useHandle.test.tsx`

- [ ] **Step 1: Write the useHandle test**

Create `__tests__/features/identity/hooks/useHandle.test.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act } from '@testing-library/react-native'
import { useHandle } from '../../../../src/features/identity/hooks/useHandle'

const mockCheckAvailability = jest.fn()
const mockResolve = jest.fn()

jest.mock('../../../../src/features/identity/chain', () => ({
  checkHandleAvailability: (...args: unknown[]) => mockCheckAvailability(...args),
  resolveHandle: (...args: unknown[]) => mockResolve(...args),
}))

jest.mock('../../../../src/core/providers/ChainProvider', () => ({
  useChain: () => ({
    chainId: 'base-sepolia',
    publicClient: {},
  }),
}))

describe('useHandle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('checks handle availability', async () => {
    mockCheckAvailability.mockResolvedValue(true)

    const { result } = renderHook(() => useHandle())

    await act(async () => {
      await result.current.checkAvailability('myhandle')
    })

    expect(result.current.status.available).toBe(true)
    expect(result.current.status.handle).toBe('myhandle')
  })

  it('reports unavailable handle', async () => {
    mockCheckAvailability.mockResolvedValue(false)

    const { result } = renderHook(() => useHandle())

    await act(async () => {
      await result.current.checkAvailability('taken')
    })

    expect(result.current.status.available).toBe(false)
  })

  it('handles check errors', async () => {
    mockCheckAvailability.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useHandle())

    await act(async () => {
      await result.current.checkAvailability('test')
    })

    expect(result.current.status.error).toBe('Network error')
    expect(result.current.status.available).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="useHandle"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement useHandle**

Create `src/features/identity/hooks/useHandle.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useState } from 'react'
import { useChain } from '../../../core/providers/ChainProvider'
import { checkHandleAvailability, resolveHandle } from '../chain'
import type { OnChainResolveResult } from '../chain'
import type { HandleStatus } from '../types'

interface UseHandleResult {
  status: HandleStatus
  checkAvailability: (handle: string) => Promise<void>
  resolve: (handle: string) => Promise<OnChainResolveResult | null>
  reset: () => void
}

const INITIAL_STATUS: HandleStatus = {
  handle: '',
  available: null,
  checking: false,
  error: null,
}

export function useHandle(): UseHandleResult {
  const { chainId, publicClient } = useChain()
  const [status, setStatus] = useState<HandleStatus>(INITIAL_STATUS)

  const checkAvailability = useCallback(
    async (handle: string) => {
      setStatus({ handle, available: null, checking: true, error: null })
      try {
        const available = await checkHandleAvailability(handle, publicClient, chainId)
        setStatus({ handle, available, checking: false, error: null })
      } catch (err: unknown) {
        setStatus({
          handle,
          available: null,
          checking: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [chainId, publicClient]
  )

  const resolve = useCallback(
    async (handle: string): Promise<OnChainResolveResult | null> => {
      try {
        return await resolveHandle(handle, publicClient, chainId)
      } catch {
        return null
      }
    },
    [chainId, publicClient]
  )

  const reset = useCallback(() => {
    setStatus(INITIAL_STATUS)
  }, [])

  return { status, checkAvailability, resolve, reset }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="useHandle"`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/features/identity/hooks/useHandle.ts __tests__/features/identity/hooks/useHandle.test.tsx
git commit -m "feat(saga-app): add useHandle hook for handle availability checking

Built with d7r FlowState"
```

---

### Task 5: useMint Hook

**Files:**

- Create: `packages/saga-app/src/features/identity/hooks/useMint.ts`
- Create: `packages/saga-app/__tests__/features/identity/hooks/useMint.test.tsx`

- [ ] **Step 1: Write the useMint test**

Create `__tests__/features/identity/hooks/useMint.test.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act } from '@testing-library/react-native'
import { useMint } from '../../../../src/features/identity/hooks/useMint'

const mockMintAgent = jest.fn()
const mockMintOrg = jest.fn()

jest.mock('../../../../src/features/identity/chain', () => ({
  mintAgent: (...args: unknown[]) => mockMintAgent(...args),
  mintOrg: (...args: unknown[]) => mockMintOrg(...args),
}))

jest.mock('../../../../src/core/providers/ChainProvider', () => ({
  useChain: () => ({
    chainId: 'base-sepolia',
    publicClient: {},
  }),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    addIdentity: jest.fn(),
  }),
}))

describe('useMint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('starts at type selection step', () => {
    const { result } = renderHook(() => useMint())

    expect(result.current.state.step).toBe('type')
    expect(result.current.state.entityType).toBeNull()
  })

  it('advances through wizard steps', () => {
    const { result } = renderHook(() => useMint())

    act(() => {
      result.current.selectType('agent')
    })

    expect(result.current.state.step).toBe('handle')
    expect(result.current.state.entityType).toBe('agent')
  })

  it('resets state on cancel', () => {
    const { result } = renderHook(() => useMint())

    act(() => {
      result.current.selectType('agent')
    })
    act(() => {
      result.current.reset()
    })

    expect(result.current.state.step).toBe('type')
    expect(result.current.state.entityType).toBeNull()
  })

  it('transitions to confirm after handle entry', () => {
    const { result } = renderHook(() => useMint())

    act(() => {
      result.current.selectType('agent')
    })
    act(() => {
      result.current.setHandle('myagent')
      result.current.setHubUrl('https://hub.example.com')
      result.current.confirmHandle()
    })

    expect(result.current.state.step).toBe('confirm')
    expect(result.current.state.handle).toBe('myagent')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="useMint"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement useMint**

Create `src/features/identity/hooks/useMint.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useState } from 'react'
import type { WalletClient } from 'viem'
import { useChain } from '../../../core/providers/ChainProvider'
import { useStorage } from '../../../core/providers/StorageProvider'
import { mintAgent, mintOrg } from '../chain'
import type { EntityType, MintState } from '../types'

const INITIAL_STATE: MintState = {
  step: 'type',
  entityType: null,
  handle: '',
  orgName: '',
  hubUrl: '',
  error: null,
  txHash: null,
  tokenId: null,
  tbaAddress: null,
}

interface UseMintResult {
  state: MintState
  selectType: (type: EntityType) => void
  setHandle: (handle: string) => void
  setOrgName: (name: string) => void
  setHubUrl: (url: string) => void
  confirmHandle: () => void
  executeMint: (walletClient: WalletClient) => Promise<void>
  reset: () => void
}

export function useMint(): UseMintResult {
  const { chainId, publicClient } = useChain()
  const { addIdentity } = useStorage()
  const [state, setState] = useState<MintState>(INITIAL_STATE)

  const selectType = useCallback((type: EntityType) => {
    setState(prev => ({ ...prev, entityType: type, step: 'handle' }))
  }, [])

  const setHandle = useCallback((handle: string) => {
    setState(prev => ({ ...prev, handle }))
  }, [])

  const setOrgName = useCallback((name: string) => {
    setState(prev => ({ ...prev, orgName: name }))
  }, [])

  const setHubUrl = useCallback((url: string) => {
    setState(prev => ({ ...prev, hubUrl: url }))
  }, [])

  const confirmHandle = useCallback(() => {
    setState(prev => ({ ...prev, step: 'confirm' }))
  }, [])

  const executeMint = useCallback(
    async (walletClient: WalletClient) => {
      setState(prev => ({ ...prev, step: 'minting', error: null }))

      try {
        const result =
          state.entityType === 'agent'
            ? await mintAgent(state.handle, state.hubUrl, walletClient, publicClient, chainId)
            : await mintOrg(state.handle, state.orgName, walletClient, publicClient, chainId)

        const identity = {
          id: `${state.entityType}-${result.tokenId.toString()}`,
          type: state.entityType as EntityType,
          handle: state.handle,
          tokenId: result.tokenId.toString(),
          contractAddress: '',
          tbaAddress: result.tbaAddress,
          hubUrl: state.hubUrl,
        }

        addIdentity(identity)

        setState(prev => ({
          ...prev,
          step: 'done',
          txHash: result.txHash,
          tokenId: result.tokenId.toString(),
          tbaAddress: result.tbaAddress,
        }))
      } catch (err: unknown) {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    },
    [
      state.entityType,
      state.handle,
      state.hubUrl,
      state.orgName,
      publicClient,
      chainId,
      addIdentity,
    ]
  )

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    selectType,
    setHandle,
    setOrgName,
    setHubUrl,
    confirmHandle,
    executeMint,
    reset,
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="useMint"`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/features/identity/hooks/useMint.ts __tests__/features/identity/hooks/useMint.test.tsx
git commit -m "feat(saga-app): add useMint hook for identity NFT minting flow

Built with d7r FlowState"
```

---

### Task 6: useIdentity Hook

**Files:**

- Create: `packages/saga-app/src/features/identity/hooks/useIdentity.ts`
- Create: `packages/saga-app/__tests__/features/identity/hooks/useIdentity.test.tsx`

- [ ] **Step 1: Write the useIdentity test**

Create `__tests__/features/identity/hooks/useIdentity.test.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act } from '@testing-library/react-native'
import { useIdentity } from '../../../../src/features/identity/hooks/useIdentity'

const mockStorage = {
  identities: [
    {
      id: 'agent-1',
      type: 'agent' as const,
      handle: 'alice',
      tokenId: '1',
      contractAddress: '0x1234',
      tbaAddress: '0xTBA1',
      hubUrl: 'https://hub.example.com',
    },
  ],
  activeIdentityId: 'agent-1',
  setActiveIdentity: jest.fn(),
}

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => mockStorage,
}))

describe('useIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns identities from storage', () => {
    const { result } = renderHook(() => useIdentity())

    expect(result.current.identities).toHaveLength(1)
    expect(result.current.identities[0].handle).toBe('alice')
  })

  it('returns active identity', () => {
    const { result } = renderHook(() => useIdentity())

    expect(result.current.activeIdentity?.handle).toBe('alice')
  })

  it('allows setting active identity', () => {
    const { result } = renderHook(() => useIdentity())

    act(() => {
      result.current.setActive('agent-1')
    })

    expect(mockStorage.setActiveIdentity).toHaveBeenCalledWith('agent-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="useIdentity"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement useIdentity**

Create `src/features/identity/hooks/useIdentity.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useMemo } from 'react'
import { useStorage } from '../../../core/providers/StorageProvider'
import type { Identity } from '../../../core/providers/StorageProvider'

interface UseIdentityResult {
  identities: Identity[]
  activeIdentity: Identity | null
  setActive: (id: string) => void
}

export function useIdentity(): UseIdentityResult {
  const { identities, activeIdentityId, setActiveIdentity } = useStorage()

  const activeIdentity = useMemo(
    () => identities.find(i => i.id === activeIdentityId) ?? null,
    [identities, activeIdentityId]
  )

  const setActive = useCallback(
    (id: string) => {
      setActiveIdentity(id)
    },
    [setActiveIdentity]
  )

  return { identities, activeIdentity, setActive }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @d7r/saga-app test -- --testPathPattern="useIdentity"`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/features/identity/hooks/useIdentity.ts __tests__/features/identity/hooks/useIdentity.test.tsx
git commit -m "feat(saga-app): add useIdentity hook for identity list management

Built with d7r FlowState"
```

---

### Task 7: Identity Persistence in StorageProvider

**Files:**

- Modify: `packages/saga-app/src/core/providers/StorageProvider.tsx`

The StorageProvider already has `addIdentity` and `updateIdentity` but they only update in-memory state. This task adds Realm persistence for identities, matching the pattern used for wallets.

- [ ] **Step 1: Update addIdentity to write to Realm**

In `StorageProvider.tsx`, update the `addIdentity` callback to persist to Realm:

```typescript
const addIdentity = useCallback((identity: Identity) => {
  RealmStore.write(() => {
    const realm = RealmStore.getInstance()
    realm.create('Identity', {
      id: identity.id,
      type: identity.type,
      handle: identity.handle,
      tokenId: identity.tokenId,
      contractAddress: identity.contractAddress,
      tbaAddress: identity.tbaAddress,
      hubUrl: identity.hubUrl,
      metadata: '{}',
    })
  })
  setIdentities(prev => [...prev, identity])
}, [])
```

- [ ] **Step 2: Add deleteIdentity method**

Add a `deleteIdentity` method to the context interface and implementation:

```typescript
// In StorageContextValue interface:
deleteIdentity: (id: string) => void

// Implementation:
const deleteIdentity = useCallback(
  (id: string) => {
    RealmStore.write(() => {
      const realm = RealmStore.getInstance()
      const record = realm.objectForPrimaryKey('Identity', id)
      if (record) realm.delete(record)
    })
    if (activeIdentityId === id) {
      setActiveIdentityId(null)
      AppStorage.set('activeIdentityId', '')
    }
    setIdentities(prev => prev.filter(i => i.id !== id))
  },
  [activeIdentityId],
)
```

- [ ] **Step 3: Load identities from Realm on init**

In the `init` function, add identity loading after wallet loading:

```typescript
const identityResults = RealmStore.query<IdentityRecord>('Identity')
const loadedIdentities: Identity[] = Array.from(identityResults).map(i => ({
  id: i.id,
  type: i.type,
  handle: i.handle,
  tokenId: i.tokenId,
  contractAddress: i.contractAddress,
  tbaAddress: i.tbaAddress,
  hubUrl: i.hubUrl,
}))
setIdentities(loadedIdentities)
```

Add `IdentityRecord` to the imports from `../storage/realm-schemas`.

- [ ] **Step 4: Update updateIdentity to write to Realm**

```typescript
const updateIdentity = useCallback((id: string, patch: Partial<Identity>) => {
  RealmStore.write(() => {
    const realm = RealmStore.getInstance()
    const record = realm.objectForPrimaryKey('Identity', id)
    if (record) {
      if (patch.handle !== undefined) record.handle = patch.handle
      if (patch.hubUrl !== undefined) record.hubUrl = patch.hubUrl
      if (patch.tbaAddress !== undefined) record.tbaAddress = patch.tbaAddress
      if (patch.contractAddress !== undefined) record.contractAddress = patch.contractAddress
      if (patch.tokenId !== undefined) record.tokenId = patch.tokenId
    }
  })
  setIdentities(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
}, [])
```

- [ ] **Step 5: Add deleteIdentity to value object**

Add `deleteIdentity` to the `value` object and the `StorageContextValue` interface.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/providers/StorageProvider.tsx
git commit -m "feat(saga-app): add Realm-backed identity persistence in StorageProvider

Built with d7r FlowState"
```

---

### Task 8: Identity Components

**Files:**

- Create: `packages/saga-app/src/features/identity/components/IdentityCard.tsx`
- Create: `packages/saga-app/src/features/identity/components/HandleChecker.tsx`

- [ ] **Step 1: Create IdentityCard component**

Create `src/features/identity/components/IdentityCard.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Badge } from '../../../components/Badge'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'
import type { IdentityData } from '../types'

interface IdentityCardProps {
  identity: IdentityData
  onPress?: () => void
  isActive?: boolean
}

export function IdentityCard({
  identity,
  onPress,
  isActive,
}: IdentityCardProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isActive && styles.active, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Badge label={identity.type.toUpperCase()} variant={identity.type} />
        {isActive && <Text style={styles.activeLabel}>Active</Text>}
      </View>
      <Text style={styles.handle}>@{identity.handle}</Text>
      <Text style={styles.detail} numberOfLines={1}>
        TBA: {identity.tbaAddress || 'Not created'}
      </Text>
      {identity.hubUrl ? (
        <Text style={styles.detail} numberOfLines={1}>
          Hub: {identity.hubUrl}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  active: {
    borderColor: colors.primary,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  handle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
})
```

- [ ] **Step 2: Create HandleChecker component**

Create `src/features/identity/components/HandleChecker.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { TextInput } from '../../../components/TextInput'
import { colors, spacing, typography } from '../../../core/theme'
import type { HandleStatus } from '../types'

interface HandleCheckerProps {
  status: HandleStatus
  onCheck: (handle: string) => void
  onChangeHandle: (handle: string) => void
}

export function HandleChecker({
  status,
  onCheck,
  onChangeHandle,
}: HandleCheckerProps): React.JSX.Element {
  const [localHandle, setLocalHandle] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (text: string) => {
      const cleaned = text.toLowerCase().replace(/[^a-z0-9-_]/g, '')
      setLocalHandle(cleaned)
      onChangeHandle(cleaned)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (cleaned.length >= 3) {
        debounceRef.current = setTimeout(() => onCheck(cleaned), 500)
      }
    },
    [onCheck, onChangeHandle]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const statusColor =
    status.available === true
      ? colors.success
      : status.available === false
        ? colors.error
        : colors.textTertiary
  const statusText = status.checking
    ? 'Checking...'
    : status.available === true
      ? 'Available'
      : status.available === false
        ? 'Taken'
        : status.error
          ? status.error
          : localHandle.length < 3
            ? 'Min 3 characters'
            : ''

  return (
    <View>
      <TextInput
        label="Handle"
        value={localHandle}
        onChangeText={handleChange}
        placeholder="myhandle"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {statusText ? (
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  status: {
    ...typography.caption,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
})
```

- [ ] **Step 3: Run tests to verify no regressions**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/identity/components/IdentityCard.tsx src/features/identity/components/HandleChecker.tsx
git commit -m "feat(saga-app): add IdentityCard and HandleChecker components

Built with d7r FlowState"
```

---

### Task 9: Navigation Updates and Identity Screens

**Files:**

- Modify: `packages/saga-app/src/navigation/types.ts`
- Create: `packages/saga-app/src/features/identity/screens/IdentityManager.tsx`
- Create: `packages/saga-app/src/features/identity/screens/MintWizard.tsx`
- Create: `packages/saga-app/src/features/identity/screens/IdentityDetail.tsx`
- Create: `packages/saga-app/src/features/identity/screens/HandleManager.tsx`
- Modify: `packages/saga-app/src/navigation/stacks/ProfileStack.tsx`

- [ ] **Step 1: Update navigation types**

In `src/navigation/types.ts`, expand `ProfileStackParamList`:

```typescript
export type ProfileStackParamList = {
  MyProfile: undefined
  IdentityManager: undefined
  MintWizard: undefined
  IdentityDetail: { identityId: string }
  HandleManager: undefined
}
```

- [ ] **Step 2: Create IdentityManager screen**

Create `src/features/identity/screens/IdentityManager.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '../../../components/Button'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { colors, spacing, typography } from '../../../core/theme'
import { useIdentity } from '../hooks/useIdentity'
import { IdentityCard } from '../components/IdentityCard'
import type { ProfileStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'IdentityManager'>

export function IdentityManager({ navigation }: Props): React.JSX.Element {
  const { identities, activeIdentity, setActive } = useIdentity()

  return (
    <SafeArea>
      <Header title="Identities" onBack={() => navigation.goBack()} />
      <View style={styles.container}>
        {identities.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Identities</Text>
            <Text style={styles.emptySubtitle}>Mint an Agent or Org NFT to get started</Text>
          </View>
        ) : (
          <FlatList
            data={identities}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <IdentityCard
                identity={item}
                isActive={item.id === activeIdentity?.id}
                onPress={() => {
                  setActive(item.id)
                  navigation.navigate('IdentityDetail', { identityId: item.id })
                }}
              />
            )}
          />
        )}
        <View style={styles.actions}>
          <Button title="Mint New Identity" onPress={() => navigation.navigate('MintWizard')} />
          <Button
            title="Manage Handles"
            variant="secondary"
            onPress={() => navigation.navigate('HandleManager')}
          />
        </View>
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  separator: { height: spacing.md },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textTertiary, textAlign: 'center' },
  actions: { padding: spacing.lg, gap: spacing.md },
})
```

- [ ] **Step 3: Create MintWizard screen**

Create `src/features/identity/screens/MintWizard.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '../../../components/Button'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { TextInput } from '../../../components/TextInput'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { colors, spacing, typography } from '../../../core/theme'
import { useMint } from '../hooks/useMint'
import { useHandle } from '../hooks/useHandle'
import { HandleChecker } from '../components/HandleChecker'
import type { ProfileStackParamList } from '../../../navigation/types'
import type { EntityType } from '../types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'MintWizard'>

export function MintWizard({ navigation }: Props): React.JSX.Element {
  const mint = useMint()
  const handle = useHandle()
  const { state } = mint

  const handleCancel = () => {
    mint.reset()
    handle.reset()
    navigation.goBack()
  }

  return (
    <SafeArea>
      <Header title="Mint Identity" onBack={handleCancel} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {state.step === 'type' && <TypeSelection onSelect={mint.selectType} />}
        {state.step === 'handle' && (
          <HandleEntry
            entityType={state.entityType!}
            handleStatus={handle.status}
            orgName={state.orgName}
            hubUrl={state.hubUrl}
            onCheck={handle.checkAvailability}
            onChangeHandle={mint.setHandle}
            onChangeOrgName={mint.setOrgName}
            onChangeHubUrl={mint.setHubUrl}
            onConfirm={mint.confirmHandle}
            onBack={() => {
              mint.reset()
              handle.reset()
            }}
          />
        )}
        {state.step === 'confirm' && (
          <Confirmation
            state={state}
            onMint={() => {
              // Placeholder: walletClient will come from wallet signing
              // For now executeMint needs a WalletClient — this will be wired
              // when the wallet feature provides signing capability
            }}
            onBack={() => mint.reset()}
          />
        )}
        {state.step === 'minting' && (
          <View style={styles.center}>
            <LoadingSpinner />
            <Text style={styles.mintingText}>Minting your identity...</Text>
            <Text style={styles.mintingSubtext}>Waiting for transaction confirmation</Text>
          </View>
        )}
        {state.step === 'done' && (
          <MintSuccess
            state={state}
            onDone={() => {
              mint.reset()
              navigation.goBack()
            }}
          />
        )}
        {state.step === 'error' && (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Minting Failed</Text>
            <Text style={styles.errorText}>{state.error}</Text>
            <Button title="Try Again" onPress={mint.reset} />
          </View>
        )}
      </ScrollView>
    </SafeArea>
  )
}

function TypeSelection({ onSelect }: { onSelect: (type: EntityType) => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Choose Identity Type</Text>
      <Card onPress={() => onSelect('agent')}>
        <View style={styles.typeCard}>
          <Badge label="AGENT" variant="agent" />
          <Text style={styles.typeTitle}>Agent Identity</Text>
          <Text style={styles.typeDesc}>For AI agents, bots, and automated services</Text>
        </View>
      </Card>
      <View style={styles.spacer} />
      <Card onPress={() => onSelect('org')}>
        <View style={styles.typeCard}>
          <Badge label="ORG" variant="org" />
          <Text style={styles.typeTitle}>Organization Identity</Text>
          <Text style={styles.typeDesc}>For companies, teams, and groups</Text>
        </View>
      </Card>
    </View>
  )
}

function HandleEntry({
  entityType,
  handleStatus,
  orgName,
  hubUrl,
  onCheck,
  onChangeHandle,
  onChangeOrgName,
  onChangeHubUrl,
  onConfirm,
  onBack,
}: {
  entityType: EntityType
  handleStatus: {
    available: boolean | null
    checking: boolean
    error: string | null
    handle: string
  }
  orgName: string
  hubUrl: string
  onCheck: (h: string) => void
  onChangeHandle: (h: string) => void
  onChangeOrgName: (n: string) => void
  onChangeHubUrl: (u: string) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const canConfirm = handleStatus.available === true && handleStatus.handle.length >= 3

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {entityType === 'agent' ? 'Agent Details' : 'Organization Details'}
      </Text>
      <HandleChecker status={handleStatus} onCheck={onCheck} onChangeHandle={onChangeHandle} />
      {entityType === 'org' && (
        <TextInput
          label="Organization Name"
          value={orgName}
          onChangeText={onChangeOrgName}
          placeholder="My Organization"
        />
      )}
      {entityType === 'agent' && (
        <TextInput
          label="Home Hub URL"
          value={hubUrl}
          onChangeText={onChangeHubUrl}
          placeholder="https://hub.example.com"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <View style={styles.buttonRow}>
        <Button title="Back" variant="secondary" onPress={onBack} />
        <Button title="Continue" onPress={onConfirm} disabled={!canConfirm} />
      </View>
    </View>
  )
}

function Confirmation({
  state,
  onMint,
  onBack,
}: {
  state: { entityType: EntityType | null; handle: string; hubUrl: string; orgName: string }
  onMint: () => void
  onBack: () => void
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Confirm Mint</Text>
      <Card>
        <View style={styles.confirmDetails}>
          <Badge
            label={(state.entityType ?? 'agent').toUpperCase()}
            variant={state.entityType ?? 'agent'}
          />
          <Text style={styles.confirmHandle}>@{state.handle}</Text>
          {state.entityType === 'org' && (
            <Text style={styles.confirmDetail}>Name: {state.orgName}</Text>
          )}
          {state.hubUrl ? <Text style={styles.confirmDetail}>Hub: {state.hubUrl}</Text> : null}
          <Text style={styles.confirmNote}>
            This will send a transaction to mint your identity NFT on Base Sepolia. Gas fees apply.
          </Text>
        </View>
      </Card>
      <View style={styles.buttonRow}>
        <Button title="Back" variant="secondary" onPress={onBack} />
        <Button title="Mint Identity" onPress={onMint} />
      </View>
    </View>
  )
}

function MintSuccess({
  state,
  onDone,
}: {
  state: {
    handle: string
    txHash: string | null
    tokenId: string | null
    tbaAddress: string | null
  }
  onDone: () => void
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.successTitle}>Identity Minted!</Text>
      <Card>
        <View style={styles.confirmDetails}>
          <Text style={styles.confirmHandle}>@{state.handle}</Text>
          <Text style={styles.confirmDetail}>Token ID: {state.tokenId}</Text>
          <Text style={styles.confirmDetail} numberOfLines={1}>
            TBA: {state.tbaAddress}
          </Text>
          <Text style={styles.confirmDetail} numberOfLines={1}>
            TX: {state.txHash}
          </Text>
        </View>
      </Card>
      <Button title="Done" onPress={onDone} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  typeCard: { gap: spacing.xs },
  typeTitle: { ...typography.h3, color: colors.textPrimary },
  typeDesc: { ...typography.bodySmall, color: colors.textSecondary },
  spacer: { height: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  mintingText: { ...typography.h2, color: colors.textPrimary },
  mintingSubtext: { ...typography.body, color: colors.textTertiary },
  confirmDetails: { gap: spacing.sm },
  confirmHandle: { ...typography.h2, color: colors.textPrimary },
  confirmDetail: { ...typography.bodySmall, color: colors.textSecondary },
  confirmNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  successTitle: { ...typography.h1, color: colors.success },
  errorTitle: { ...typography.h2, color: colors.error },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
})
```

- [ ] **Step 4: Create IdentityDetail screen**

Create `src/features/identity/screens/IdentityDetail.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { ListItem } from '../../../components/ListItem'
import { colors, spacing, typography } from '../../../core/theme'
import { useIdentity } from '../hooks/useIdentity'
import type { ProfileStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'IdentityDetail'>

export function IdentityDetail({ navigation, route }: Props): React.JSX.Element {
  const { identities, activeIdentity, setActive } = useIdentity()
  const identity = identities.find(i => i.id === route.params.identityId)

  if (!identity) {
    return (
      <SafeArea>
        <Header title="Identity" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.notFound}>Identity not found</Text>
        </View>
      </SafeArea>
    )
  }

  const isActive = identity.id === activeIdentity?.id

  return (
    <SafeArea>
      <Header title={`@${identity.handle}`} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.container}>
        <View style={styles.headerSection}>
          <Badge label={identity.type.toUpperCase()} variant={identity.type} />
          <Text style={styles.handle}>@{identity.handle}</Text>
          {isActive && <Text style={styles.activeLabel}>Active Identity</Text>}
        </View>

        <Card>
          <View style={styles.details}>
            <ListItem title="Token ID" rightText={identity.tokenId} />
            <ListItem title="Type" rightText={identity.type} />
            <ListItem title="TBA Address" subtitle={identity.tbaAddress || 'Not created'} />
            {identity.hubUrl ? <ListItem title="Home Hub" subtitle={identity.hubUrl} /> : null}
            {identity.contractAddress ? (
              <ListItem title="Contract" subtitle={identity.contractAddress} />
            ) : null}
          </View>
        </Card>

        {!isActive && (
          <View style={styles.actions}>
            <Text style={styles.actionLink} onPress={() => setActive(identity.id)}>
              Set as Active Identity
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerSection: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  handle: { ...typography.h1, color: colors.textPrimary },
  activeLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  details: {},
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notFound: { ...typography.body, color: colors.textTertiary },
  actions: { padding: spacing.lg, alignItems: 'center' },
  actionLink: { ...typography.body, color: colors.primary },
})
```

- [ ] **Step 5: Create HandleManager screen**

Create `src/features/identity/screens/HandleManager.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { TextInput } from '../../../components/TextInput'
import { Button } from '../../../components/Button'
import { Badge } from '../../../components/Badge'
import { ListItem } from '../../../components/ListItem'
import { colors, spacing, typography } from '../../../core/theme'
import { useIdentity } from '../hooks/useIdentity'
import { useHandle } from '../hooks/useHandle'
import type { ProfileStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'HandleManager'>

export function HandleManager({ navigation }: Props): React.JSX.Element {
  const { identities } = useIdentity()
  const { status, checkAvailability, resolve, reset } = useHandle()
  const [lookupHandle, setLookupHandle] = useState('')
  const [resolvedInfo, setResolvedInfo] = useState<{
    entityType: string
    tokenId: string
  } | null>(null)

  const handleLookup = async () => {
    if (!lookupHandle) return
    const result = await resolve(lookupHandle)
    if (result) {
      setResolvedInfo({
        entityType: result.entityType,
        tokenId: result.tokenId.toString(),
      })
    } else {
      setResolvedInfo(null)
    }
  }

  return (
    <SafeArea>
      <Header title="Handles" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>My Handles</Text>
        {identities.length === 0 ? (
          <Text style={styles.emptyText}>No registered handles</Text>
        ) : (
          <Card>
            {identities.map(i => (
              <ListItem
                key={i.id}
                title={`@${i.handle}`}
                subtitle={i.hubUrl || 'No hub URL'}
                rightText={i.type}
              />
            ))}
          </Card>
        )}

        <Text style={[styles.sectionTitle, styles.topMargin]}>Resolve Handle</Text>
        <TextInput
          label="Handle"
          value={lookupHandle}
          onChangeText={setLookupHandle}
          placeholder="Enter handle to look up"
          autoCapitalize="none"
        />
        <Button title="Resolve" onPress={handleLookup} variant="secondary" />

        {resolvedInfo && (
          <Card>
            <View style={styles.resolvedInfo}>
              <Badge
                label={resolvedInfo.entityType}
                variant={resolvedInfo.entityType.toLowerCase() as 'agent' | 'org' | 'directory'}
              />
              <Text style={styles.resolvedText}>Token ID: {resolvedInfo.tokenId}</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  topMargin: { marginTop: spacing.lg },
  emptyText: { ...typography.body, color: colors.textTertiary },
  resolvedInfo: { gap: spacing.sm },
  resolvedText: { ...typography.body, color: colors.textSecondary },
})
```

- [ ] **Step 6: Update ProfileStack navigation**

Replace the contents of `src/navigation/stacks/ProfileStack.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../../components/Button'
import { SafeArea } from '../../components/SafeArea'
import { Header } from '../../components/Header'
import { colors, spacing, typography } from '../../core/theme'
import { useIdentity } from '../../features/identity/hooks/useIdentity'
import { IdentityCard } from '../../features/identity/components/IdentityCard'
import { IdentityManager } from '../../features/identity/screens/IdentityManager'
import { MintWizard } from '../../features/identity/screens/MintWizard'
import { IdentityDetail } from '../../features/identity/screens/IdentityDetail'
import { HandleManager } from '../../features/identity/screens/HandleManager'
import type { ProfileStackParamList } from '../types'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

type MyProfileProps = NativeStackScreenProps<ProfileStackParamList, 'MyProfile'>

function MyProfileScreen({ navigation }: MyProfileProps): React.JSX.Element {
  const { activeIdentity } = useIdentity()

  return (
    <SafeArea>
      <Header title="Profile" />
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Identity</Text>
        {activeIdentity ? (
          <IdentityCard
            identity={activeIdentity}
            isActive
            onPress={() => navigation.navigate('IdentityDetail', { identityId: activeIdentity.id })}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No active identity</Text>
          </View>
        )}
        <View style={styles.actions}>
          <Button
            title="Manage Identities"
            onPress={() => navigation.navigate('IdentityManager')}
          />
        </View>
      </View>
    </SafeArea>
  )
}

const Stack = createNativeStackNavigator<ProfileStackParamList>()

export function ProfileStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyProfile" component={MyProfileScreen} />
      <Stack.Screen name="IdentityManager" component={IdentityManager} />
      <Stack.Screen name="MintWizard" component={MintWizard} />
      <Stack.Screen name="IdentityDetail" component={IdentityDetail} />
      <Stack.Screen name="HandleManager" component={HandleManager} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  empty: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  actions: {
    marginTop: spacing.lg,
  },
})
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/navigation/types.ts src/navigation/stacks/ProfileStack.tsx src/features/identity/screens/
git commit -m "feat(saga-app): add identity screens and Profile tab navigation

Built with d7r FlowState"
```

---

### Task 10: Network Switcher in Settings

**Files:**

- Create: `packages/saga-app/src/features/identity/screens/NetworkSettings.tsx`
- Modify: `packages/saga-app/src/navigation/types.ts`
- Modify: `packages/saga-app/src/navigation/stacks/ProfileStack.tsx`

- [ ] **Step 1: Add NetworkSettings route**

In `src/navigation/types.ts`, add to `ProfileStackParamList`:

```typescript
NetworkSettings: undefined
```

- [ ] **Step 2: Create NetworkSettings screen**

Create `src/features/identity/screens/NetworkSettings.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { StatusIndicator } from '../../../components/StatusIndicator'
import { colors, spacing, typography } from '../../../core/theme'
import { useChain } from '../../../core/providers/ChainProvider'
import type { ProfileStackParamList } from '../../../navigation/types'
import type { ChainId } from '../../wallet/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'NetworkSettings'>

const NETWORKS: { id: ChainId; name: string; description: string }[] = [
  { id: 'base-sepolia', name: 'Base Sepolia', description: 'Testnet (free transactions)' },
  { id: 'base', name: 'Base', description: 'Mainnet (real transactions)' },
]

export function NetworkSettings({ navigation }: Props): React.JSX.Element {
  const { chainId, setChainId } = useChain()

  return (
    <SafeArea>
      <Header title="Network" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Select Network</Text>
        <Text style={styles.description}>
          Choose which blockchain network to use for identity and wallet operations.
        </Text>
        {NETWORKS.map(network => (
          <Card key={network.id} onPress={() => setChainId(network.id)}>
            <View style={styles.networkRow}>
              <View style={styles.networkInfo}>
                <Text style={styles.networkName}>{network.name}</Text>
                <Text style={styles.networkDesc}>{network.description}</Text>
              </View>
              {chainId === network.id && <StatusIndicator status="connected" />}
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  networkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  networkInfo: { flex: 1 },
  networkName: { ...typography.h3, color: colors.textPrimary },
  networkDesc: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 2 },
})
```

- [ ] **Step 3: Register screen in ProfileStack**

In `ProfileStack.tsx`, add import and screen:

```tsx
import { NetworkSettings } from '../../features/identity/screens/NetworkSettings'

// In the Stack.Navigator, add:
;<Stack.Screen name="NetworkSettings" component={NetworkSettings} />
```

Also add a "Network" button in `MyProfileScreen` below the "Manage Identities" button:

```tsx
<Button
  title="Network Settings"
  variant="secondary"
  onPress={() => navigation.navigate('NetworkSettings')}
/>
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/identity/screens/NetworkSettings.tsx src/navigation/types.ts src/navigation/stacks/ProfileStack.tsx
git commit -m "feat(saga-app): add network switcher for Base / Base Sepolia

Built with d7r FlowState"
```

---

### Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @d7r/saga-app test`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @d7r/saga-app typecheck`
Expected: Clean — no type errors.

- [ ] **Step 3: Verify SPDX headers**

Every `.ts` and `.tsx` file created in this phase must have:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC
```

- [ ] **Step 4: Verify all files committed**

Run: `git status`
Expected: Clean working tree on the feature branch.

- [ ] **Step 5: Commit any remaining changes**

If there are lockfile changes or other incidental files:

```bash
git add pnpm-lock.yaml
git commit -m "chore(saga-app): update lockfile for Phase 3 dependencies

Built with d7r FlowState"
```
