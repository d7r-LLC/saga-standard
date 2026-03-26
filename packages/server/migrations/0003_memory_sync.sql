-- SAGA Schema v3: Memory Sync Canonical Store
-- Stores encrypted memory-sync envelopes for pull-on-activation

CREATE TABLE IF NOT EXISTS memory_envelopes (
  id TEXT PRIMARY KEY,
  agent_handle TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  envelope_ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_envelopes_agent_ts
  ON memory_envelopes(agent_handle, stored_at);
