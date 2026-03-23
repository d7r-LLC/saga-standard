-- SAGA Schema v2: NFT Identity Layer
-- Adds on-chain identity fields to agents and creates organizations table

ALTER TABLE agents ADD COLUMN token_id INTEGER;
ALTER TABLE agents ADD COLUMN tba_address TEXT;
ALTER TABLE agents ADD COLUMN contract_address TEXT;
ALTER TABLE agents ADD COLUMN mint_tx_hash TEXT;
ALTER TABLE agents ADD COLUMN entity_type TEXT DEFAULT 'agent';
ALTER TABLE agents ADD COLUMN home_hub_url TEXT;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  token_id INTEGER,
  tba_address TEXT,
  contract_address TEXT,
  mint_tx_hash TEXT,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orgs_wallet ON organizations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_orgs_handle ON organizations(handle);
CREATE INDEX IF NOT EXISTS idx_agents_token ON agents(token_id);
