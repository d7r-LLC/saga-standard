> **FlowState Document:** `docu_RsJ-Z4Zq1I`

# Marketplace OIDC Integration Design

**Date:** 2026-03-11
**Status:** Approved
**Goal:** Replace NextAuth in the marketplace with a custom OIDC client that authenticates against the FlowState Identity Server (`id.epicflowstate.ai`).

**Architecture:** The marketplace becomes a standard OIDC Relying Party using Arctic (OAuth2Client for PKCE flow) and oslo/jwt (ID token verification). Authentication UI and upstream providers (GitHub, Google, magic link) are handled entirely by the identity server. The marketplace maintains its own KV-backed session and local profiles table linked by the identity server's `sub` claim.

**Tech Stack:** Arctic, oslo/jwt, Cloudflare Workers KV, D1 (Drizzle ORM)

---

## 1. Auth Flow

1. User clicks "Sign in with FlowState" on marketplace
2. `GET /auth/login` generates PKCE (code_verifier + S256 challenge), state, and nonce. Stores all three in an HttpOnly cookie. Redirects to `{IDENTITY_ISSUER_URL}/authorize?client_id=marketplace&response_type=code&scope=openid+profile+email+offline_access&redirect_uri={callback}&state={state}&nonce={nonce}&code_challenge={challenge}&code_challenge_method=S256`
3. User authenticates at the identity server (provider choice happens there)
4. Identity server redirects back to `/auth/callback?code=...&state=...`
5. Callback validates state matches cookie, exchanges code + code_verifier at identity server's `/api/oauth/token` endpoint (no client_secret — public client)
6. Callback validates the ID token: RS256 signature via JWKS, `iss`, `aud=marketplace`, nonce match, expiry
7. Callback creates a local KV session, sets `__session` HttpOnly cookie
8. Callback upserts a `profiles` row linked by `identityId` (the `sub` claim)
9. Redirect to original destination (from `callbackUrl` param or `/dashboard`)

### Logout

1. `GET /auth/logout` destroys local KV session, clears `__session` cookie
2. Redirects to `{IDENTITY_ISSUER_URL}/api/oauth/logout?post_logout_redirect_uri={marketplace_url}`

---

## 2. OIDC Client Configuration

- **Client ID:** `marketplace`
- **Client type:** Public (PKCE-only, no client_secret)
- **Scopes:** `openid profile email offline_access`
- **Redirect URIs:**
  - `https://marketplace.epicflowstate.ai/auth/callback` (production)
  - `https://flowstate-marketplace-staging.epicdm.workers.dev/auth/callback` (staging)
  - `http://localhost:3000/auth/callback` (local dev)
- **First-party:** Yes (auto-consent, no consent screen)

---

## 3. File Changes

### New Files (Marketplace)

| File                             | Purpose                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/oidc/client.ts`         | OIDC client: authorization URL (Arctic OAuth2Client + PKCE), code exchange, ID token verification (oslo/jwt + JWKS fetch) |
| `src/lib/session/kv-session.ts`  | KV session management: create/get/destroy, cookie helpers. Same pattern as identity server.                               |
| `src/app/auth/login/route.ts`    | GET: generate PKCE, set cookie, redirect to identity server /authorize                                                    |
| `src/app/auth/callback/route.ts` | GET: validate state, exchange code, validate ID token, create session, upsert profile, redirect                           |
| `src/app/auth/logout/route.ts`   | GET: destroy session, redirect to identity server logout                                                                  |

### Modified Files (Marketplace)

| File                            | Change                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/middleware.ts`             | Check `__session` cookie instead of `authjs.session-token`                                                                       |
| `src/lib/admin-auth.ts`         | Replace `createAuth().auth()` with KV session lookup by `__session` cookie. Same interface (requireAuth, requireDeveloper, etc.) |
| `src/app/(auth)/login/page.tsx` | Replace magic link form + GitHub button with single "Sign in with FlowState" button                                              |
| `src/db/schema.ts`              | Drop users/accounts/sessions/verificationTokens tables. Add `identityId` to profiles, drop `userId`. Update FKs in other tables. |
| `src/env.d.ts`                  | Add `IDENTITY_ISSUER_URL` env var, `SESSIONS` KV binding                                                                         |
| `wrangler.jsonc`                | Add `SESSIONS` KV binding, `IDENTITY_ISSUER_URL` var per environment                                                             |
| `package.json`                  | Add arctic + oslo, remove next-auth + @auth/drizzle-adapter                                                                      |

### Removed Files (Marketplace)

| File                                      | Reason                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| `src/auth.ts`                             | NextAuth config — replaced by OIDC client              |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth catch-all route — replaced by /auth/\* routes |

### Identity Server Changes

| File                            | Change                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `scripts/seed-clients.ts`       | Add staging callback URL to marketplace client's redirect_uris |
| D1 (local, staging, production) | Re-seed marketplace client with updated redirect_uris          |

---

## 4. Database Schema Changes

No data migration needed (no production data).

### Drop Tables

- `users` — identity lives on identity server
- `accounts` — federated accounts on identity server
- `sessions` — replaced by KV sessions
- `verificationTokens` — magic links on identity server

### Modify `profiles`

- Drop `userId` column (FK to local users)
- Add `identityId` TEXT UNIQUE NOT NULL — the `sub` claim from identity server

### Other Table FK Changes

All tables that had `userId` FK to local `users` now store the identity server's `sub` claim directly (text, no FK constraint since source of truth is external):

- `activityLogs.userId`
- `reviews.userId`
- `publishers.userId`
- `supportTickets.userId`
- `supportMessages.senderId`
- `stripeCustomers.userId`
- `installEvents.userId`
- `purchases.userId`
- `listingPurchases.userId`

---

## 5. Session Model

**Storage:** Cloudflare Workers KV (`SESSIONS` binding)
**Cookie:** `__session`, HttpOnly, Secure, SameSite=Lax
**TTL:** 7 days
**Session data:**

```typescript
interface SessionData {
  identityId: string // identity server sub claim
  email: string
  name: string
  avatarUrl: string | null
  role: ProfileRole // from local profiles table
  createdAt: string
}
```

**Functions:**

- `createSession(kv, data)` → sessionId
- `getSession(kv, sessionId)` → SessionData | null
- `destroySession(kv, sessionId)` → void
- `buildSessionCookie(sessionId)` → Set-Cookie header string
- `buildSessionClearCookie()` → Set-Cookie header string (Max-Age=0)

---

## 6. OIDC Client Module

**`src/lib/oidc/client.ts`**

- `buildAuthorizationUrl(issuerUrl, redirectUri)` — Arctic OAuth2Client generates PKCE code_verifier/challenge, state, nonce. Returns `{ url, state, nonce, codeVerifier }`
- `exchangeCode(issuerUrl, code, codeVerifier, redirectUri)` — POST to `{issuerUrl}/api/oauth/token` with grant_type=authorization_code, client_id=marketplace, PKCE verifier. Returns `{ idToken, accessToken, refreshToken }`
- `verifyIdToken(idToken, issuerUrl, clientId, nonce)` — Fetch JWKS from `{issuerUrl}/.well-known/jwks.json`, verify RS256 signature via oslo/jwt, validate iss, aud, exp, nonce. Returns decoded claims (`sub`, `email`, `name`, `picture`, etc.)
- JWKS cached in KV with 1-hour TTL

---

## 7. Environment & Deployment

### New Environment Variables (Marketplace)

| Variable              | Production                    | Staging                               | Local                   |
| --------------------- | ----------------------------- | ------------------------------------- | ----------------------- |
| `IDENTITY_ISSUER_URL` | `https://id.epicflowstate.ai` | `https://id-staging.epicflowstate.ai` | `http://localhost:3100` |

### New KV Namespaces

- `flowstate-marketplace-sessions` (production)
- `flowstate-marketplace-sessions-staging` (staging)

### Dependencies

**Add:** `arctic`, `oslo`
**Remove:** `next-auth`, `@auth/drizzle-adapter`

### Deploy Order

1. Update identity server seed (add staging redirect URI) → re-seed local/staging/production
2. Deploy marketplace to staging → test full OIDC flow
3. Deploy marketplace to production
