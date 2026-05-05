-- Cleanup of two stale agent records on saga-hub-staging D1.
--
-- Origin: these records were created by POST /v1/agents on a prior
-- staging instance that pointed at mainnet contracts (chain
-- eip155:8453) before the Phase 12 testnet stack was wired. They have
-- tokenId NULL because they were never on-chain minted; the indexer
-- has nothing to update on them, and they can't be removed via any
-- public API.
--
-- The records:
--   - agent_9f343debf38f1209328889ebbd0f52ad
--     handle 'smoke-test-mn1qmnap', chain eip155:8453 (mainnet)
--   - agent_7ff052542b2cb96d5b9f9cbc97c39ffd
--     handle 'test-staging-agent', chain eip155:84532
--
-- Both are testnet-leftover artifacts with no on-chain backing.
--
-- Run via:
--   pnpm exec wrangler d1 execute saga-hub-staging --env staging \
--     --remote --file scripts/2026-05-05-cleanup-stale-staging-agents.sql
--
-- Idempotent: re-running is a no-op once the records are gone.
-- Safe-by-construction: filters by exact agentId (PK), so it cannot
-- delete any record that wasn't pre-identified by ID.
--
-- FK dependents: `documents` and `transfers` both have
--   agent_id TEXT NOT NULL REFERENCES agents(id)
-- (per migrations/0001_initial.sql). Delete child rows first to avoid
-- FOREIGN KEY constraint failures.

DELETE FROM documents
WHERE agent_id IN (
  'agent_9f343debf38f1209328889ebbd0f52ad',
  'agent_7ff052542b2cb96d5b9f9cbc97c39ffd'
);

DELETE FROM transfers
WHERE agent_id IN (
  'agent_9f343debf38f1209328889ebbd0f52ad',
  'agent_7ff052542b2cb96d5b9f9cbc97c39ffd'
);

DELETE FROM agents
WHERE id IN (
  'agent_9f343debf38f1209328889ebbd0f52ad',
  'agent_7ff052542b2cb96d5b9f9cbc97c39ffd'
);
