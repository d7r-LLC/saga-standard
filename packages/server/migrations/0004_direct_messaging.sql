-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 d7r LLC

-- Phase 5: Direct Messaging
-- Add public_key to organizations and create group_members table

ALTER TABLE organizations ADD COLUMN public_key TEXT;

CREATE TABLE group_members (
  group_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, handle)
);

CREATE INDEX idx_group_members_handle ON group_members (handle);
