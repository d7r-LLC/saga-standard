// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// ABIs
export {
  SAGAHandleRegistryAbi,
  SAGAAgentIdentityAbi,
  SAGAOrgIdentityAbi,
  SAGADirectoryIdentityAbi,
  SAGATBAHelperAbi,
} from './abis'

// Addresses
export {
  getDeployedAddress,
  isDeployed,
  ERC6551_REGISTRY,
  type SupportedChain,
  type ContractName,
} from './addresses'

// Contract config helpers (spread into viem's getContract)
export {
  getHandleRegistryConfig,
  getAgentIdentityConfig,
  getOrgIdentityConfig,
  getDirectoryIdentityConfig,
  getTBAHelperConfig,
} from './clients'

// Types
export {
  ENTITY_TYPE_VALUES,
  entityTypeFromNumber,
  type EntityType,
  type HandleRecord,
  type AgentIdentity,
  type OrgIdentity,
  type DirectoryIdentity,
} from './types'

// TBA
export { computeTBAAddress } from './tba'
