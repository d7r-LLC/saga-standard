-- Phase 7B: Directory identity indexing
CREATE TABLE IF NOT EXISTS directories (
  id TEXT PRIMARY KEY,
  directory_id TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  operator_wallet TEXT NOT NULL,
  conformance_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  token_id INTEGER,
  contract_address TEXT,
  chain TEXT NOT NULL,
  mint_tx_hash TEXT,
  tba_address TEXT,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directories_operator ON directories(operator_wallet);
CREATE INDEX IF NOT EXISTS idx_directories_status ON directories(status);

-- Add directoryId to agents for directory-scoped registrations
ALTER TABLE agents ADD COLUMN directory_id TEXT;
