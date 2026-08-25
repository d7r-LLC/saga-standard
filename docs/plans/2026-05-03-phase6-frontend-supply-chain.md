**FlowState Task:** `task_8VdkQqbDz4`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 6 — Frontend, supply chain, public surface

## Findings closed in this PR

| #   | Severity | Source   | Action                                                                                                                                                                                                                                                                                                                                               |
| --- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Medium   | A-Med#10 | CSP + standard security headers on every directory route. Strict-Transport-Security, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin. CSP is locked-down (`default-src 'self'`, no `unsafe-inline` script) with explicit allowances for the WalletConnect bridge.                              |
| 6.2 | Medium   | A-Med#10 | Pin `@walletconnect/*` deps to exact versions (drop the `^`). Add `.github/workflows/security-audit.yml` that runs `pnpm audit --audit-level=high` weekly.                                                                                                                                                                                           |
| 6.3 | Medium   | A-Med#13 | OIDC `callbackUrl` validation in directory middleware: reject anything but a same-origin relative path (no scheme, no `//`, must start with `/`). Add tests.                                                                                                                                                                                         |
| 6.4 | Low      | O-Low#2  | Replace `app.use('*', cors())` with an origin-allowlist policy in `packages/server/src/index.ts`. Production defaults to empty allowlist (no cross-origin); dev/test reads `CORS_ALLOWED_ORIGINS` env var. SECURITY.md documents the open-default reference posture.                                                                                 |
| 6.5 | Medium   | G-Med#2  | Tighten ESLint `no-console` to `error` globally; keep CLI/tests overrides (those packages legitimately log). Remove the `warn`/`error` allowance from production code.                                                                                                                                                                               |
| 6.6 | Info     | G-Info#1 | Pin Husky to exact `9.1.7` (drop the `^`). Pre-commit hook already uses the v9 shim-less format, no migration work needed.                                                                                                                                                                                                                           |
| 6.7 | Low      | A-Low#7  | New `containsUnsafeMarkdown(s)` helper in `packages/sdk/src/validate/markdown-safety.ts`: rejects raw HTML tags, `javascript:` URIs, and `data:text/html` URIs. Wire into `semantic-validator.ts` for any persona / cognitive markdown field. Document that downstream renderers must STILL sanitize via DOMPurify-or-equivalent (defense in depth). |

## Findings deferred

| #                                       | Severity | Why deferred                                                                                                                                                 |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EIP-6963-only WalletConnect alternative | Low      | Replacing WalletConnect entirely is an architectural change (different injected-provider discovery path, different UX). Pin + audit is sufficient near-term. |
| HSTS preload submission                 | Info     | Submit `directory.d7r.io` to chromium HSTS preload list once production rollout stabilizes.                                                                  |

## Implementation

### 6.1 CSP + security headers

Add response headers via Next.js middleware and `next.config.mjs`:

- **Middleware** (`packages/directory/src/middleware.ts`): generates a per-request nonce, attaches `Content-Security-Policy` header so inline `<script nonce="...">` tags from Next.js's hydration runtime keep working without `'unsafe-inline'`.
- **`next.config.mjs` `headers()`**: ships the static security headers (`Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`).

CSP policy:

```
default-src 'self';
script-src 'self' 'nonce-<nonce>';
style-src 'self' 'unsafe-inline';        # Next.js styled-jsx requires this
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com;
frame-src 'self' https://verify.walletconnect.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

### 6.2 Dependency pinning + npm audit CI

`packages/directory/package.json`:

- `"@walletconnect/ethereum-provider": "2.17.0"` (no caret)
- `"@walletconnect/modal": "2.7.0"` (no caret)

`.github/workflows/security-audit.yml`:

- Weekly cron (`0 13 * * 1`) + on-push trigger.
- Runs `pnpm install --frozen-lockfile` then `pnpm audit --audit-level=high` against the workspace.
- Fails the build on any `high`/`critical` vulnerability.

### 6.3 OIDC callbackUrl same-origin validation

In `packages/directory/src/middleware.ts`, before passing `callbackUrl` to the connect redirect:

```ts
function isSafeCallbackUrl(url: string | null | undefined): url is string {
  if (!url) return false
  if (typeof url !== 'string') return false
  if (!url.startsWith('/')) return false // must be relative
  if (url.startsWith('//')) return false // protocol-relative -> off-origin
  return true
}
```

Apply in middleware: when reading `pathname` for the redirect's `callbackUrl`, validate it's safe; if not, default to `/`.

When the auth callback handler receives a `callbackUrl` query param at the end of the flow, apply the same check before redirecting back. Test cases:

- `/dashboard` → safe (starts with `/`, not `//`)
- `//evil.example.com/x` → unsafe (protocol-relative)
- `https://evil.example.com` → unsafe (absolute)
- `javascript:alert(1)` → unsafe (no leading `/`)
- empty / undefined → unsafe

### 6.4 CORS allowlist

In `packages/server/src/index.ts`:

```ts
import { cors } from 'hono/cors'

const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(
  '*',
  cors({
    origin: origin => {
      if (!origin) return '' // disallow no-origin
      if (allowedOrigins.includes(origin)) return origin
      return null // reject
    },
    credentials: false,
  })
)
```

`SECURITY.md` already documents this is a reference impl. Add a Phase 6 note under "Default CORS posture" explaining production deployers must set `CORS_ALLOWED_ORIGINS` to their directory app's origin.

### 6.5 ESLint no-console

`.eslintrc.js`:

- Global rule (line ~13) and TS-files rule (line ~45): change `'warn'` to `'error'`. Keep `allow: ['warn', 'error']` so `console.warn(...)` / `console.error(...)` still work for legitimate diagnostics.

The CLI override (already `'no-console': 'off'`) and tests override stay as-is.

### 6.6 Husky pin

`package.json`: `"husky": "9.1.7"` (drop `^`). No code or hook changes — the pre-commit script is already shim-less v9 format.

### 6.7 Markdown HTML / javascript-URI rejection

New file `packages/sdk/src/validate/markdown-safety.ts`:

```ts
const HTML_TAG = /<\s*[a-zA-Z][\s\S]*?>/                      // any tag
const JS_URI = /\bjavascript\s*:/i                            // javascript:...
const DATA_HTML = /\bdata\s*:\s*text\/html\b/i                // data:text/html

export interface MarkdownSafetyResult {
  ok: boolean
  reason?: 'html-tag' | 'javascript-uri' | 'data-html-uri'
}

export function checkMarkdownSafety(s: string): MarkdownSafetyResult { ... }
```

Wire into `semantic-validator.ts` for the document fields that hold user markdown (e.g., persona block, cognitive fields). Validation rejects with a clear error.

`SECURITY.md` consumer note: this validator catches the obvious vectors but is NOT a substitute for a real HTML sanitizer (DOMPurify) at render time. Frontends MUST sanitize before innerHTML.

## Acceptance criteria

- `pnpm --filter @d7r/saga-server test` green
- `pnpm --filter @d7r/saga-sdk test` green (new markdown-safety.test.ts)
- `pnpm --filter @d7r/saga-directory test` green (new middleware-csp.test.ts, callback-url-validation.test.ts)
- `pnpm lint` clean (no-console upgrade)
- New tests:
  - CSP header present on every middleware-handled request
  - X-Frame-Options, X-Content-Type-Options on directory routes
  - `isSafeCallbackUrl` accepts/rejects per spec
  - CORS rejects unlisted origin, accepts listed origin
  - markdown-safety rejects `<script>`, `javascript:`, `data:text/html`
- `.github/workflows/security-audit.yml` lint via `actionlint` (or basic YAML parse) and committed

## Out of scope

- Replace WalletConnect with EIP-6963-only flow
- HSTS preload submission
- Full DOMPurify integration in directory app (separate task)

## Commit plan

Multi-commit single PR:

1. `feat(directory): CSP + security headers via middleware + next.config` (6.1)
2. `chore(directory): pin walletconnect deps + add weekly npm audit CI` (6.2)
3. `feat(directory): same-origin validation on OIDC callbackUrl` (6.3)
4. `feat(server): CORS origin allowlist (CORS_ALLOWED_ORIGINS env var)` (6.4)
5. `chore(eslint): no-console = error globally; CLI/tests overrides preserved` (6.5)
6. `chore: pin husky to exact 9.1.7` (6.6)
7. `feat(sdk): reject HTML tags + javascript:/data:text/html URIs in markdown fields` (6.7)

Each commit ends with `Built with d7r FlowState`.
