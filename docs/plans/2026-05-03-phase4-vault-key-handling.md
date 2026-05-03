**FlowState Task:** `task_luCNrRDOJi`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 4 — Vault, key handling, scrypt parameters

## Findings closed in this PR

| #   | Severity | Source   | Action                                                                                                                                                                                                                                                |
| --- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | High     | A-High#8 | Vault item AES-GCM AAD binding via optional `aadContext` parameter on encrypt/decrypt. Cross-item key-wrap swap fails AES-GCM auth when context differs. Backward-compatible: omit context → empty AAD (matches existing data).                       |
| 4.2 | Medium   | G-Med#1  | Bump scrypt cost `N: 16384 → N: 65536` for new keystores. Decrypt path already reads `ks.crypto.kdfParams.n` so old wallets continue to load.                                                                                                         |
| 4.5 | Low      | O-Low#1  | Audit confirms all `Buffer.from(...)` calls in `vault-crypto.ts` already pass an explicit encoding (`'base64'` / `'utf-8'`). Adding a regression test pins this.                                                                                      |
| 4.6 | Low      | A-Low#1  | New `loadWalletKey()` API returns a `WalletKey` handle with `.privateKey` + `.clear()` so callers can zero the decrypted bytes after signing. Existing `loadWalletPrivateKey` is preserved as a thin wrapper for back-compat with `string` consumers. |

## Findings deferred to follow-up tasks

| #   | Severity | Why deferred                                                                                                                                                                                                                                                     |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.3 | High A#6 | Decouple federation signing from `OPERATOR_PRIVATE_KEY`. Requires (a) on-chain registry of authorized delegate signing keys per directory, (b) rotation protocol, (c) coordinated relay-server + indexer changes. Architectural — own design pass + spec update. |
| 4.4 | Low G#1  | Replace `node:crypto` with `@noble/ciphers` or `tweetnacl.secretbox` in `vault-crypto.ts`. Substantive swap across the SDK with React Native packaging implications; needs its own focused PR.                                                                   |

## Implementation

### 4.1 AAD binding

`encryptVaultItem`/`decryptVaultItem` gain an optional `aadContext` parameter — a `Record<string, string | number | undefined>` of item-identifying fields (e.g. `{ itemId, type, name, createdAt }`). When present:

1. Encrypt path canonicalizes the context (sorted keys, JSON), hashes with SHA-256, and passes the digest as `setAAD(...)` to both AES-GCM ciphers (item ciphertext + DEK key-wrap).
2. Decrypt path computes the digest from the caller's `aadContext`, sets it as AAD on both deciphers. AES-GCM auth fails if either AAD mismatches.

The AAD digest is **not** persisted on the wrapped DEK or the encrypted payload — both sides derive it independently from the caller-supplied `aadContext`. The persistence layer is responsible for keeping the context fields (e.g. `itemId`, `type`, `name`, `createdAt`) intact so the decrypt-side caller can reconstruct the same context. Tampering with any of those fields invalidates the AES-GCM auth tag on the next decrypt.

When `aadContext` is omitted (or `undefined`), no AAD is set on encrypt/decrypt — preserving the old behavior so legacy vault items still decrypt cleanly.

### 4.2 Scrypt N

`encryptKeystore` in `wallet-store.ts`: change `N: 16384` → `N: 65536`. The keystore JSON records the actual N used (`kdfParams.n`), so decryption of old wallets with `n: 16384` continues to work unchanged.

OWASP 2023+ recommends N ≥ 2^17 for new code; 2^16 is a conservative middle ground that doesn't materially harm wallet-creation latency.

### 4.6 WalletKey clearable handle

New API in `wallet-store.ts`:

```ts
export interface WalletKey {
  /** The 0x-prefixed hex private key. Backed by a Buffer that can be zeroed. */
  readonly privateKey: string
  /** Zero the underlying buffer. After this call, .privateKey returns ''. */
  clear(): void
}

export function loadWalletKey(name: string, password: string): WalletKey
```

Internally, the decrypted Buffer is held in a closure; `.privateKey` lazily encodes it to hex on each access; `.clear()` zeroes the Buffer and flips a flag.

`loadWalletPrivateKey()` is preserved as a back-compat shim that calls `loadWalletKey().privateKey` and discards the handle (the existing API can't zero anyway since strings are immutable).

Callers that hold the key for longer than a single sign should switch to `loadWalletKey` and `clear()` after use.

## Acceptance criteria

- `pnpm --filter @epicdm/saga-server test` green
- `pnpm --filter @epicdm/saga-cli test` green
- `pnpm --filter @epicdm/saga-sdk test` green
- New vault-crypto tests:
  - Without AAD: encrypt/decrypt round-trip works (unchanged).
  - With AAD: same context decrypts; tampered context fails AES-GCM auth.
  - Buffer.from explicit-encoding regression assertion.
- New wallet-store tests:
  - New keystore uses `N=65536`.
  - Old keystore with `N=16384` still decrypts correctly.
  - `loadWalletKey` returns a `WalletKey`; `.clear()` zeroes the underlying buffer (subsequent `.privateKey` is empty).

## Out of scope

- 4.3 (federation signing key separation) — follow-up
- 4.4 (node:crypto removal) — follow-up
- Phase 5+ findings

## Commit plan

```
feat(security): Phase 4 (scoped) — vault AAD binding + scrypt N=65536 + clearable wallet key

Built with Epic Flowstate
```
