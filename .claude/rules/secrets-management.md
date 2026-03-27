# Secrets Management

## CRITICAL: No Plaintext Secrets

**NEVER store plaintext secrets in:**

- `.env` files (local or committed)
- `.env.local`, `.env.development`, `.env.production`
- Source code files (`.ts`, `.tsx`, `.js`, `.jsx`)
- Configuration files (`config.json`, `settings.json`)
- Test files (unless explicitly marked as test credentials)
- Docker Compose files or Dockerfiles
- CI/CD configuration files
- Comments or documentation

**The ONLY exception:** Test credentials that are explicitly fake/mock values clearly labeled as such.

### Test Token Rules

Test tokens MUST be **obviously fake** — they must not resemble real credentials in structure or format. Secret scanners (GitGuardian, gitleaks) use pattern matching, so even fake values that match real credential formats will trigger alerts.

**FORBIDDEN patterns in test tokens:**

| Pattern                                 | Why It Triggers Scanners                                            |
| --------------------------------------- | ------------------------------------------------------------------- |
| `eyJhbGciOiJ...` (base64 JWT segments)  | Matches JWT token structure — GitGuardian flags any `Bearer eyJ...` |
| `sk_live_...`, `sk_test_...`            | Matches Stripe API key format                                       |
| `ghp_...`, `gho_...`                    | Matches GitHub token format                                         |
| `AKIA...` (20-char uppercase)           | Matches AWS access key format                                       |
| `xoxb-...`, `xoxp-...`                  | Matches Slack token format                                          |
| Any three dot-separated base64 segments | Matches JWT structure even without `eyJ` prefix                     |
| `Bearer` + realistic-looking token      | Triggers Bearer token detection rules                               |

**REQUIRED patterns for test tokens:**

```typescript
// GOOD - Obviously fake, no real credential patterns
const TEST_TOKEN = 'test-token-123'
const MOCK_SECRET = 'mock-secret-for-testing-only'
const FAKE_BEARER = 'fake-test.token-with.dots-and-mixed-CASE'
const TEST_API_KEY = 'test_fake_key_not_real_12345'

// GOOD - Clearly labeled constants
const TEST_JWT_SECRET = 'correct-secret' // Plain string, not JWT format
const WRONG_TOKEN = 'wrong-token' // For auth rejection tests

// BAD - Looks like real credentials (triggers secret scanners)
const TEST_TOKEN = '<base64-header>.<base64-payload>.<signature>' // JWT format!
const API_KEY = 'sk_live_<looks-real>...' // Stripe format!
const DATABASE_URL = 'postgresql://user:pass@host:5432/db' // Real connection string!
```

**When testing token parsing/validation:**

- Use plain strings with dots if you need dot-separated segments: `'fake-test.token-with.dots'`
- Use descriptive names that indicate the token's purpose: `'correct-secret'`, `'wrong-token'`
- Never use real base64-encoded content, even if the payload is fake

## Required: Use `@epicdm/flowstate-env`

**All packages MUST use `packages/flowstate-env` to source secrets from the secret management backend.**

### Installation

```bash
# Add as dependency to your package
yarn workspace @epicdm/your-package add @epicdm/flowstate-env
```

### Usage

```typescript
import { getSecret, getRequiredSecret } from '@epicdm/flowstate-env'

// Get optional secret (returns undefined if not found)
const apiKey = await getSecret('API_KEY')

// Get required secret (throws if not found)
const databaseUrl = await getRequiredSecret('DATABASE_URL')

// Get secret with default fallback
const logLevel = await getSecret('LOG_LEVEL', 'info')
```

## Secret Resolution Order

The `flowstate-env` package resolves secrets in this order:

1. **Service Token** (CI/CD, Production)
   - Environment variable: `OP_SERVICE_ACCOUNT_TOKEN`
   - Used for automated deployments and server environments

2. **Authenticated 1Password CLI** (Local Development)
   - Requires: `op signin` to authenticate
   - Uses: `op read "op://vault/item/field"`

3. **Environment Variables** (Fallback)
   - Only for non-sensitive configuration
   - Never for actual secrets

## Environment Setup

### Local Development

```bash
# Authenticate with 1Password CLI (one-time)
op signin

# Verify authentication
op whoami

# Secrets are now automatically resolved via flowstate-env
yarn dev
```

### CI/CD & Production

```bash
# Set service account token in environment
export OP_SERVICE_ACCOUNT_TOKEN="ops_xxxxx"

# Application automatically uses token for secret resolution
```

## Vault Configuration

Secret vault mappings are defined in `.flowstate/config.json`:

```json
{
  "secrets": {
    "vault": "FlowState-Dev",
    "items": {
      "DATABASE_URL": "Database/connection-string",
      "API_KEY": "API Keys/primary-key",
      "JWT_SECRET": "Auth/jwt-secret"
    }
  }
}
```

## What TO Do

| Scenario            | Correct Approach                          |
| ------------------- | ----------------------------------------- |
| Need database URL   | `await getRequiredSecret('DATABASE_URL')` |
| Need API key        | `await getSecret('EXTERNAL_API_KEY')`     |
| Configure for tests | Use mock/fake values clearly labeled      |
| Share with team     | Add to 1Password vault, update config     |
| CI/CD needs secret  | Use `OP_SERVICE_ACCOUNT_TOKEN`            |

## What NOT To Do

| Scenario        | Wrong Approach         | Why It's Wrong           |
| --------------- | ---------------------- | ------------------------ |
| Quick testing   | Put real key in `.env` | Risks accidental commit  |
| Share with team | Send via Slack/email   | Insecure, no audit trail |
| Docker setup    | Hardcode in Dockerfile | Exposed in image layers  |
| CI/CD config    | Put in workflow file   | Visible in repo history  |
