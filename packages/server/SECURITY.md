# Security Notes — SAGA Reference Server

## Signature Verification

The reference server does NOT perform full EIP-191 signature verification. The `verifySignature` function in `src/routes/auth.ts` performs only minimal placeholder checks (rejecting signatures shorter than 10 characters) and does not validate that the signature is well-formed hex, 0x-prefixed, or cryptographically authentic. Security relies on the challenge-response mechanism (nonce + expiry) for replay protection, not cryptographic verification of wallet ownership.

**This is a known limitation of the reference implementation.** Production deployments MUST integrate proper signature verification using viem's `verifyMessage` or equivalent:

```typescript
import { verifyMessage } from 'viem'

const valid = await verifyMessage({
  address: walletAddress,
  message: challenge,
  signature,
})
```

## CORS

The server uses permissive CORS (`cors()` with no origin restriction). Production deployments should restrict allowed origins.

## Session Tokens

Session tokens are stored in Cloudflare KV with a 1-hour TTL. Tokens are opaque strings, not JWTs. There is no token rotation or refresh mechanism beyond re-authentication.
