> **FlowState Document:** `docu_g44ZznVdrI`

# Phase 4: Wallet Signing + Live Minting — Design

**Date:** 2026-03-27
**Package:** `@epicdm/saga-app`
**Depends on:** Phase 3 (On-Chain Identity)

## Goal

Enable end-to-end identity minting by wiring wallet signing into the MintWizard. Users pick a wallet, sign the transaction, and mint their Agent or Org identity NFT on-chain from the app.

## Current State

- **ChainProvider** exposes `publicClient` (read-only). No signing client.
- **useMint.executeMint(walletClient)** is implemented but nobody calls it because there's no way to get a `WalletClient` in the identity feature.
- **MintWizard** Confirmation step has the mint button disabled with text "Wallet signing will be available in a future update."
- **SendFlow** (wallet feature) already builds a `WalletClient` inline by loading a mnemonic from the keychain. This pattern works but isn't reusable.

## Architecture

A new `useWalletSigner()` hook extracts the mnemonic-to-WalletClient pattern from SendFlow into a reusable unit. MintWizard adds a wallet selector to the Confirmation step and calls `executeMint()` with the signing client.

```
User taps "Mint Identity"
    │
    ▼
useWalletSigner(walletId)
    │  loads mnemonic from SecureKeychain
    │  creates viem WalletClient with HDAccount
    ▼
useMint().executeMint(walletClient)
    │  calls mintAgent/mintOrg via @epicdm/saga-client
    │  waits for tx confirmation via publicClient
    ▼
Success: tokenId, TBA address, txHash
```

## New File

### `features/wallet/hooks/useWalletSigner.ts`

Reusable hook that creates a viem `WalletClient` from a wallet's keychain mnemonic.

**Interface:**

```typescript
interface UseWalletSignerResult {
  getWalletClient: () => Promise<WalletClient>
  signing: boolean
  error: string | null
  clearError: () => void
}

function useWalletSigner(walletId: string | null): UseWalletSignerResult
```

**Behavior:**

- Accepts a `walletId`. Returns `getWalletClient()` which lazily loads the mnemonic from `SecureKeychain` and creates a viem `WalletClient`.
- The WalletClient is cached for the lifetime of the walletId (recreated if walletId changes).
- `signing` is true while loading mnemonic / creating client.
- `error` captures keychain failures ("Wallet key not found", etc.).
- Uses `useChain()` to get the current `chainId` for the WalletClient's chain config.

**Why a hook, not a provider:**

- ChainProvider should stay read-only (chain config, RPC).
- Signing is an action, not persistent state. Loading a mnemonic into memory should be short-lived and explicit.
- A hook is composable: any screen that needs signing can call it.

## Modified Files

### `features/identity/screens/MintWizard.tsx`

Changes to the Confirmation component:

1. **Wallet selector**: If multiple wallets exist, show a picker. If one wallet, auto-select it. If no wallets, show "Create a wallet first" with a navigation action.
2. **Mint button**: Enabled when a wallet is selected. On press, calls `getWalletClient()` then `executeMint(walletClient)`.
3. **Remove disabled state**: Delete the "Wallet signing will be available in a future update" text.

The MintWizard component itself needs to:

- Import `useWalletSigner` and `useStorage` (for wallet list)
- Pass the selected wallet ID to `useWalletSigner`
- Pass `getWalletClient` result to `executeMint`

### `features/identity/hooks/useMint.ts`

No changes needed. The hook already accepts a `WalletClient` parameter and handles the full minting flow including error handling and state transitions.

## Data Flow

1. User navigates MintWizard: type -> handle -> confirm
2. Confirmation step renders wallet selector, pre-selects active wallet
3. User taps "Mint Identity"
4. `useWalletSigner.getWalletClient()` fires:
   - Loads mnemonic from `SecureKeychain.get(KEYCHAIN_MNEMONIC_PREFIX-{walletId})`
   - Creates `mnemonicToAccount()` with the wallet's derivation path
   - Creates `createWalletClient({ account, chain, transport: http() })`
5. MintWizard calls `mint.executeMint(walletClient)`
6. useMint sets step to 'minting', calls `mintAgent()` or `mintOrg()` via chain helpers
7. On success: step -> 'done' with tokenId, tbaAddress, txHash
8. On error: step -> 'error' with message

## Error Handling

| Error                              | Source               | User sees                                                                 |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| No wallets exist                   | StorageProvider      | Inline message on Confirm step: "Create a wallet first."                  |
| Mnemonic not in keychain           | SecureKeychain.get() | Inline message on Confirm step: "Wallet key not found. Re-import."        |
| Insufficient funds                 | viem transaction     | useMint error step: "Insufficient funds for gas. Fund your wallet first." |
| Transaction reverted               | Contract call        | useMint error step: the revert reason from the contract                   |
| Network error                      | RPC transport        | useMint error step: "Network error. Check your connection and try again." |
| User has no identity type selected | useMint guard        | useMint error step: "Select an identity type before minting."             |

Signer and selection errors are shown inline on the MintWizard Confirm step; on-chain and minting failures continue to use useMint's existing error step.

## Testing

### `useWalletSigner.test.ts`

- Mock `SecureKeychain.get()` to return a test mnemonic
- Verify `getWalletClient()` returns a WalletClient with correct account address
- Verify error when mnemonic not found
- Verify `signing` state transitions (false -> true -> false)
- Verify client is recreated when walletId changes

### MintWizard updates

- Verify wallet selector renders with available wallets
- Verify mint button is disabled when no wallet selected
- Verify mint button is enabled when wallet is selected
- Verify `executeMint` is called on button press

### Existing tests

- `useMint.test.tsx` - no changes needed (already mocks the chain layer)
- `chain.test.ts` - no changes needed

## Success Criteria

- User can mint an Agent identity NFT from the app with a single wallet
- User can mint an Org identity NFT from the app with a single wallet
- User with multiple wallets can choose which one signs the transaction
- User with no wallets sees a clear message to create one first
- Transaction hash, token ID, and TBA address shown on success
- Failed transactions show a clear error with retry option
- Identity is persisted to Realm and set as active (first identity)
