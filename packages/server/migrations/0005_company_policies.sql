-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 d7r LLC

-- Phase 6: Company Data Governance
-- Replication policy storage per organization

CREATE TABLE IF NOT EXISTS replication_policies (
  org_id TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
