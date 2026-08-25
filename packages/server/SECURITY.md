> **FlowState Document:** `docu_1OUgd6s_Ph`

# Security Notes — SAGA Reference Server

## Signature Verification

The SAGA reference server **does** perform full EIP-191 (`personal_sign`) signature verification using `viem.verifyMessage` in three places. (Search each file for `verifyMessage(` — line numbers drift, but the function name is stable.)

| Path                                   | File                                           | Purpose                              |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| `POST /v1/auth/verify`                 | `packages/server/src/routes/auth.ts`           | HTTP session-token issuance          |
| `GET /v1/relay` (WebSocket)            | `packages/server/src/relay/ws-auth.ts`         | Agent/org WebSocket handshake        |
| `GET /v1/relay/federation` (WebSocket) | `packages/server/src/relay/federation-auth.ts` | Cross-directory federation handshake |

All three call sites use the same pattern:

```typescript
import { verifyMessage } from 'viem'

const valid = await verifyMessage({
  address: walletAddress as `0x${string}`,
  message: challenge,
  signature: signature as `0x${string}`,
})
```

`verifyMessage` recovers the signing address from the signature and compares it to the claimed `address`. If they don't match it returns `false`; if the signature is malformed it may either return `false` or throw. The wrapping `verifySignature` helper in `packages/server/src/routes/auth.ts` additionally:

1. Returns `false` immediately if the signature is missing or doesn't start with `0x`.
2. Wraps the `verifyMessage` call in `try/catch` so any thrown error becomes `false` (defense in depth — fail closed on any error path, never accept).

### Layered checks on `POST /v1/auth/verify`

The verify endpoint enforces **three** checks in order, all of which must pass before a session token is issued:

1. **Challenge lookup** — the submitted `(walletAddress, challenge)` pair must match a row in the `auth_challenges` table that has `used = 0`.
2. **Expiry** — the matched challenge's `expiresAt` must be in the future (5-minute TTL by default).
3. **Signature** — `verifySignature(address, challenge, signature)` must return `true`. This is the cryptographic identity check.

The challenge is marked `used = 1` between (2) and (3) — i.e., **before** signature verification. This is intentional: it prevents an attacker from running multiple signature attempts against the same challenge once the row has been located. A wrong-signature attempt burns the challenge; the caller must request a fresh challenge to retry. The session token is only issued if (3) also returns `true`; otherwise the response is `401 INVALID_SIGNATURE` and the challenge is still consumed.

### Regression coverage

The contract that signature verification is real (and not a stub) is enforced by the test
`rejects signature from wrong wallet` in `src/__tests__/server.test.ts`. That test:

- Generates two distinct private keys (Hardhat first + second test accounts).
- Requests a challenge for wallet A.
- Signs the challenge with wallet B.
- Submits to `/v1/auth/verify` with `walletAddress = A`, `signature = B's sig`.
- Asserts the response is `401` with code `INVALID_SIGNATURE`.

If anyone ever replaces `verifyMessage` with `() => true` (or otherwise weakens the check), this test fails immediately.

### How to keep this document accurate

If you change `verifySignature`, the WebSocket auth path, or the federation auth path, update this section in the same commit. The JSDoc comment above `verifySignature` in `src/routes/auth.ts` cross-references this file.

## CORS

**Phase 6 (O-Low#2) update:** the global CORS middleware is now an origin allowlist driven by the `CORS_ALLOWED_ORIGINS` environment variable.

| `CORS_ALLOWED_ORIGINS` value                       | Behavior                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| unset / empty                                      | No cross-origin access. Same-origin requests still work.                                        |
| `https://directory.d7r.io`                         | Allow exactly that origin (production deploy posture).                                          |
| `https://a.example,https://b.example` (comma list) | Allow each origin verbatim. Whitespace around commas is trimmed.                                |
| `*`                                                | Allow ANY origin. The old reference-deploy default. **Production deployers must NOT use this.** |

Wildcard `*` is the explicit opt-in for fully-open reference servers. Production handle holders MUST set `CORS_ALLOWED_ORIGINS` to their directory app's exact origin (or origins). The CORS middleware never echoes credentials and never allows arbitrary unlisted origins, even for OPTIONS preflight.

Regression coverage: `packages/server/src/__tests__/cors.test.ts`.

## User-rendered markdown (persona / cognitive fields)

**Phase 6 (A-Low#7):** `packages/sdk/src/validate/markdown-safety.ts` provides `checkMarkdownSafety()` which rejects raw HTML tags, `javascript:` URIs, and `data:text/html` URIs in user-authored markdown fields. `validateSemantics()` invokes this on `persona.headline`, `persona.bio`, `persona.personality.communicationStyle`, `persona.personality.tone`, and `cognitive.systemPrompt.content`.

**This is NOT a substitute for output-side sanitization.** Frontends rendering these fields MUST sanitize via DOMPurify-or-equivalent before innerHTML. The validator catches the obvious vectors so they never reach a renderer; the renderer's sanitizer is the second layer.

## Session Tokens

Session tokens are stored in Cloudflare KV with a 1-hour TTL. Tokens are opaque strings, not JWTs. There is no token rotation or refresh mechanism beyond re-authentication. Session revocation is not yet implemented; downstream consumers cannot invalidate a leaked token before its TTL expires. Tracked for Phase 2 of the 2026-05-03 security remediation plan (`docu_13E_mSxrv3`).
