// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import type { AgentRecord, OrgRecord } from '@epicdm/saga-client'

// Re-export client types for convenience
export type { AgentRecord, OrgRecord }

// UI-specific types
export type AgentSummary = AgentRecord
export type OrgSummary = OrgRecord
