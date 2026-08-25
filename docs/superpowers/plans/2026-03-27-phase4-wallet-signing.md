> **FlowState Document:** `docu_fqLHOmU-hy`

# Phase 4: Wallet Signing + Live Minting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable end-to-end identity minting by wiring wallet signing into the MintWizard so users can pick a wallet, sign the transaction, and mint their Agent or Org identity NFT on-chain.

**Architecture:** A new `useWalletSigner()` hook extracts the mnemonic-to-WalletClient pattern into a reusable unit. MintWizard's Confirmation step gets a wallet selector and a live "Mint Identity" button that calls `useMint().executeMint(walletClient)`. No changes needed to useMint or the chain helpers — they already accept a WalletClient.

**Tech Stack:** React Native, viem (WalletClient, mnemonicToAccount, createWalletClient), react-native-keychain (SecureKeychain), @testing-library/react-native

---

## File Structure

```
packages/saga-app/src/features/wallet/hooks/
└── useWalletSigner.ts          # NEW: Reusable hook — loads mnemonic, creates WalletClient

packages/saga-app/src/features/identity/screens/
└── MintWizard.tsx              # MODIFY: Add wallet selector + live mint button to Confirmation

packages/saga-app/__tests__/features/wallet/hooks/
└── useWalletSigner.test.tsx    # NEW: Tests for the signer hook
```

**Unchanged files (no modifications needed):**

- `src/features/identity/hooks/useMint.ts` — already accepts WalletClient
- `src/features/identity/chain.ts` — already wraps saga-client
- `src/core/providers/ChainProvider.tsx` — stays read-only
- `src/core/storage/keychain.ts` — already has get/set/remove
- `src/features/wallet/constants.ts` — already exports KEYCHAIN_MNEMONIC_PREFIX

---

### Task 1: Create useWalletSigner Hook

**Files:**

- Create: `packages/saga-app/src/features/wallet/hooks/useWalletSigner.ts`
- Test: `packages/saga-app/__tests__/features/wallet/hooks/useWalletSigner.test.tsx`

- [ ] **Step 1: Write the failing test for successful WalletClient creation**

Create `packages/saga-app/__tests__/features/wallet/hooks/useWalletSigner.test.tsx`:

```tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook } from '@testing-library/react-native'
import { useWalletSigner } from '../../../../src/features/wallet/hooks/useWalletSigner'

const TEST_MNEMONIC = 'test test test test test test test test test test test junk'

jest.mock('../../../../src/core/storage/keychain', () => ({
  SecureKeychain: {
    get: jest.fn(),
  },
}))

jest.mock('../../../../src/core/providers/ChainProvider', () => ({
  useChain: () => ({ chainId: 'base-sepolia' }),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    wallets: [
      {
        id: 'w1',
        type: 'self-custody',
        label: 'Test Wallet',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        chain: 'base-sepolia',
        balance: '1.0',
        derivationPath: "m/44'/60'/0'/0/0",
      },
    ],
  }),
}))

describe('useWalletSigner', () => {
  const { SecureKeychain } = jest.requireMock('../../../../src/core/storage/keychain')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a WalletClient when mnemonic is found', async () => {
    SecureKeychain.get.mockResolvedValue(TEST_MNEMONIC)

    const { result } = renderHook(() => useWalletSigner('w1'))

    let client: unknown
    await act(async () => {
      client = await result.current.getWalletClient()
    })

    expect(client).toBeDefined()
    expect(SecureKeychain.get).toHaveBeenCalledWith('wallet-mnemonic-w1')
    expect(result.current.error).toBeNull()
  })

  it('sets error when mnemonic is not found', async () => {
    SecureKeychain.get.mockResolvedValue(null)

    const { result } = renderHook(() => useWalletSigner('w1'))

    await expect(result.current.getWalletClient()).rejects.toThrow('Wallet key not found')
    expect(result.current.error).toBe('Wallet key not found. Re-import your wallet.')
  })

  it('sets error when walletId is null', async () => {
    const { result } = renderHook(() => useWalletSigner(null))

    await expect(result.current.getWalletClient()).rejects.toThrow('No wallet selected')
    expect(result.current.error).toBe('No wallet selected.')
  })

  it('clears error with clearError', async () => {
    SecureKeychain.get.mockResolvedValue(null)

    const { result } = renderHook(() => useWalletSigner('w1'))

    try {
      await act(async () => {
        await result.current.getWalletClient()
      })
    } catch {
      // expected
    }

    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @d7r/saga-app test 2>&1`
Expected: FAIL — `useWalletSigner` module not found

- [ ] **Step 3: Write the useWalletSigner implementation**

Create `packages/saga-app/src/features/wallet/hooks/useWalletSigner.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useRef, useState } from 'react'
import { createWalletClient, http } from 'viem'
import type { WalletClient } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { SecureKeychain } from '../../../core/storage/keychain'
import { useChain } from '../../../core/providers/ChainProvider'
import { useStorage } from '../../../core/providers/StorageProvider'
import { KEYCHAIN_MNEMONIC_PREFIX } from '../constants'
import { CHAINS, RPC_URLS } from '../../../core/chain/config'
import type { ChainId } from '../types'

export interface UseWalletSignerResult {
  getWalletClient: () => Promise<WalletClient>
  signing: boolean
  error: string | null
  clearError: () => void
}

export function useWalletSigner(walletId: string | null): UseWalletSignerResult {
  const { chainId } = useChain()
  const { wallets } = useStorage()
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cachedClient = useRef<{ walletId: string; chainId: ChainId; client: WalletClient } | null>(
    null
  )

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!walletId) {
      const msg = 'No wallet selected.'
      setError(msg)
      throw new Error('No wallet selected')
    }

    // Return cached client if walletId and chainId match
    if (
      cachedClient.current &&
      cachedClient.current.walletId === walletId &&
      cachedClient.current.chainId === chainId
    ) {
      return cachedClient.current.client
    }

    setSigning(true)
    setError(null)

    try {
      const wallet = wallets.find(w => w.id === walletId)
      const derivationPath = (wallet?.derivationPath ?? "m/44'/60'/0'/0/0") as `m/44'/60'/${string}`

      const mnemonic = await SecureKeychain.get(`${KEYCHAIN_MNEMONIC_PREFIX}-${walletId}`)

      if (!mnemonic) {
        const msg = 'Wallet key not found. Re-import your wallet.'
        setError(msg)
        throw new Error('Wallet key not found')
      }

      const account = mnemonicToAccount(mnemonic, { path: derivationPath })

      const client = createWalletClient({
        account,
        chain: CHAINS[chainId],
        transport: http(RPC_URLS[chainId]),
      })

      cachedClient.current = { walletId, chainId, client }
      return client
    } finally {
      setSigning(false)
    }
  }, [walletId, chainId, wallets])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { getWalletClient, signing, error, clearError }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @d7r/saga-app test 2>&1`
Expected: All tests PASS (59 existing + 4 new = 63 total)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/src/features/wallet/hooks/useWalletSigner.ts packages/saga-app/__tests__/features/wallet/hooks/useWalletSigner.test.tsx
git commit -m "feat(saga-app): add useWalletSigner hook for reusable transaction signing

Built with d7r FlowState"
```

---

### Task 2: Wire Wallet Signing into MintWizard

**Files:**

- Modify: `packages/saga-app/src/features/identity/screens/MintWizard.tsx`

This task modifies the `Confirmation` component inside MintWizard to:

1. Add a wallet selector (auto-selects if one wallet, picker if multiple, message if none)
2. Enable the "Mint Identity" button
3. Call `getWalletClient()` then `executeMint(walletClient)` on press
4. Remove the "Wallet signing will be available in a future update" text

- [ ] **Step 1: Add wallet imports and state to MintWizard**

In `packages/saga-app/src/features/identity/screens/MintWizard.tsx`, add these imports at the top (after the existing imports):

```typescript
import { useState } from 'react'
import { useStorage } from '../../../core/providers/StorageProvider'
import { useWalletSigner } from '../../wallet/hooks/useWalletSigner'
```

Change the `import React from 'react'` to `import React, { useState } from 'react'` (merge the useState import).

- [ ] **Step 2: Update MintWizard component to pass wallet state to Confirmation**

Replace the MintWizard function body (lines 23-84) with this updated version that adds wallet selection state and passes it to Confirmation:

```tsx
export function MintWizard({ navigation }: Props): React.JSX.Element {
  const mint = useMint()
  const handle = useHandle()
  const { wallets, activeWalletId } = useStorage()
  const { state } = mint

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(activeWalletId)
  const signer = useWalletSigner(selectedWalletId)

  const handleCancel = () => {
    mint.reset()
    handle.reset()
    navigation.goBack()
  }

  const handleMint = async () => {
    try {
      const walletClient = await signer.getWalletClient()
      await mint.executeMint(walletClient)
    } catch {
      // Error is set in signer.error or useMint state.error
    }
  }

  return (
    <SafeArea>
      <Header title="Mint Identity" leftAction={{ label: 'Cancel', onPress: handleCancel }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {state.step === 'type' && <TypeSelection onSelect={mint.selectType} />}
        {state.step === 'handle' && (
          <HandleEntry
            entityType={state.entityType!}
            handleStatus={handle.status}
            currentHandle={state.handle}
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
            wallets={wallets}
            selectedWalletId={selectedWalletId}
            onSelectWallet={setSelectedWalletId}
            signerError={signer.error}
            signing={signer.signing}
            onMint={handleMint}
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
```

- [ ] **Step 3: Replace the Confirmation component**

Replace the entire `Confirmation` function (lines 177-212 in the current file) with this updated version that includes a wallet selector and live mint button:

```tsx
function Confirmation({
  state,
  wallets,
  selectedWalletId,
  onSelectWallet,
  signerError,
  signing,
  onMint,
  onBack,
}: {
  state: { entityType: EntityType | null; handle: string; hubUrl: string; orgName: string }
  wallets: Array<{ id: string; label: string; address: string }>
  selectedWalletId: string | null
  onSelectWallet: (id: string) => void
  signerError: string | null
  signing: boolean
  onMint: () => void
  onBack: () => void
}) {
  const hasWallets = wallets.length > 0
  const canMint = hasWallets && selectedWalletId !== null && !signing

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
            This will send a transaction to mint your identity NFT. Network fees apply.
          </Text>
        </View>
      </Card>

      {!hasWallets && (
        <Card>
          <View style={styles.confirmDetails}>
            <Text style={styles.confirmDetail}>
              Create a wallet first to sign the minting transaction.
            </Text>
          </View>
        </Card>
      )}

      {hasWallets && (
        <View style={styles.walletSection}>
          <Text style={styles.walletLabel}>Signing Wallet</Text>
          {wallets.map(w => (
            <Card key={w.id} onPress={() => onSelectWallet(w.id)}>
              <View style={styles.walletOption}>
                <View style={styles.walletRadio}>
                  <View
                    style={[
                      styles.radioOuter,
                      selectedWalletId === w.id && styles.radioOuterSelected,
                    ]}
                  >
                    {selectedWalletId === w.id && <View style={styles.radioInner} />}
                  </View>
                </View>
                <View style={styles.walletInfo}>
                  <Text style={styles.walletName}>{w.label}</Text>
                  <Text style={styles.walletAddress}>
                    {w.address.slice(0, 6)}...{w.address.slice(-4)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {signerError && <Text style={styles.errorText}>{signerError}</Text>}

      <View style={styles.buttonRow}>
        <Button title="Back" variant="secondary" onPress={onBack} />
        <Button
          title={signing ? 'Signing...' : 'Mint Identity'}
          onPress={onMint}
          disabled={!canMint}
        />
      </View>
    </View>
  )
}
```

- [ ] **Step 4: Add the new styles for wallet selector**

Add these styles to the `StyleSheet.create` call at the bottom of the file (before the closing `})`):

```typescript
  walletSection: { gap: spacing.sm, marginTop: spacing.md },
  walletLabel: { ...typography.label, color: colors.textTertiary },
  walletOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  walletRadio: { justifyContent: 'center', alignItems: 'center' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  walletInfo: { flex: 1 },
  walletName: { ...typography.body, color: colors.textPrimary },
  walletAddress: { ...typography.mono, color: colors.textTertiary, fontSize: 12 },
```

- [ ] **Step 5: Run the tests to verify nothing is broken**

Run: `pnpm --filter @d7r/saga-app test 2>&1`
Expected: All tests PASS (63 total)

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @d7r/saga-app typecheck 2>&1`
Expected: Clean — no errors

- [ ] **Step 7: Commit**

```bash
git add packages/saga-app/src/features/identity/screens/MintWizard.tsx
git commit -m "feat(saga-app): wire wallet signing into MintWizard confirmation step

Built with d7r FlowState"
```

---

### Task 3: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm --filter @d7r/saga-app test 2>&1`
Expected: All 63 tests PASS across all suites

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @d7r/saga-app typecheck 2>&1`
Expected: Clean — no errors

- [ ] **Step 3: Verify SPDX headers**

Run: `head -2 packages/saga-app/src/features/wallet/hooks/useWalletSigner.ts`
Expected:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC
```

- [ ] **Step 4: Verify git status is clean**

Run: `git status`
Expected: Only auto-generated CLAUDE.md files (if any) — no untracked source files
