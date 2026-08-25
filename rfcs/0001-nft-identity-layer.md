> **FlowState Document:** `docu_a57TWo2nu8`

# RFC 0001: NFT Identity Layer

**Status:** Draft
**Author(s):** FlowState / yuki.tanaka@flowstatecloud.ai
**Created:** 2026-03-23
**Spec sections affected:** Section 4 (Layer 1: Identity)

---

## Summary

Add optional `nft` and `organization` blocks to the SAGA identity layer (Section 4). These blocks allow agents to declare on-chain NFT ownership and organizational affiliation within a SAGA document. All new fields are OPTIONAL, so existing documents remain valid without modification.

---

## Motivation

The SAGA v1.0 spec includes a `registrationTxHash` field in the identity layer, but provides no structure for what that transaction creates. Platforms that mint identity NFTs have no standard way to reference the contract address, token ID, or Token Bound Account in a SAGA document.

Three specific problems:

1. **No NFT metadata in documents.** An agent with an on-chain identity NFT cannot include the token ID, contract address, or TBA address in its SAGA export. Any platform importing that document loses the on-chain link.

2. **No org representation.** Organizations that hold agent NFTs (via TBA) have no way to appear in the SAGA document. The spec has no concept of organizational identity.

3. **No TBA reference.** ERC-6551 Token Bound Accounts are a core primitive for NFT-based agent identity, but the spec has no field for the TBA address.

---

## Proposed Change

### 1. Add `nft` block to IdentityLayer

A new OPTIONAL `nft` object within the identity layer:

```json
"identity": {
  "handle": "aria-chen",
  "walletAddress": "0xabc...123",
  "chain": "eip155:84532",
  "createdAt": "2026-01-15T08:00:00Z",
  "nft": {
    "contractAddress": "0x1111...1111",
    "tokenId": 42,
    "chain": "eip155:84532",
    "standard": "ERC-721",
    "tbaAddress": "0x4444...4444",
    "mintTxHash": "0xabcd...ef01"
  }
}
```

| Field                 | Type    | Requirement | Description                                 |
| --------------------- | ------- | ----------- | ------------------------------------------- |
| `nft.contractAddress` | string  | OPTIONAL    | Address of the identity NFT contract        |
| `nft.tokenId`         | integer | OPTIONAL    | Token ID of the agent's identity NFT        |
| `nft.chain`           | string  | OPTIONAL    | CAIP-2 chain identifier where the NFT lives |
| `nft.standard`        | string  | OPTIONAL    | Token standard (e.g., "ERC-721")            |
| `nft.tbaAddress`      | string  | OPTIONAL    | ERC-6551 Token Bound Account address        |
| `nft.mintTxHash`      | string  | OPTIONAL    | Transaction hash of the mint event          |

When `nft` is present, `nft.contractAddress` and `nft.tokenId` SHOULD both be provided. A document with `nft.tokenId` but no `nft.contractAddress` is valid but not useful.

### 2. Add `organization` block to IdentityLayer

A new OPTIONAL `organization` object:

```json
"identity": {
  "handle": "aria-chen",
  "walletAddress": "0xabc...123",
  "chain": "eip155:84532",
  "createdAt": "2026-01-15T08:00:00Z",
  "organization": {
    "handle": "d7r",
    "name": "d7r LLC",
    "contractAddress": "0x2222...2222",
    "tokenId": 7,
    "role": "employee"
  }
}
```

| Field                          | Type    | Requirement | Description                          |
| ------------------------------ | ------- | ----------- | ------------------------------------ |
| `organization.handle`          | string  | OPTIONAL    | Org handle in the shared namespace   |
| `organization.name`            | string  | OPTIONAL    | Org display name                     |
| `organization.contractAddress` | string  | OPTIONAL    | Org identity NFT contract address    |
| `organization.tokenId`         | integer | OPTIONAL    | Org NFT token ID                     |
| `organization.role`            | string  | OPTIONAL    | Agent's role within the organization |

---

## Alternatives Considered

**Flat fields on identity.** We considered adding `nftContractAddress`, `nftTokenId`, etc. directly to the identity object. Rejected because it mixes concerns: an identity can exist without an NFT, and grouping NFT fields makes the structure cleaner for non-NFT agents.

**Separate top-level layer.** A "Layer 10: On-Chain Identity" was considered. Rejected because NFT metadata is fundamentally about identity, not a new conceptual layer. Adding layers increases conformance complexity.

**Require NFT for all registrations.** Rejected. Many platforms will never use on-chain identity. Making NFT fields required would break backward compatibility and exclude non-EVM ecosystems.

---

## Backward Compatibility

This is a non-breaking change. All new fields are OPTIONAL. The IdentityLayer already sets `"additionalProperties": true` in the JSON schema, so existing validators will accept documents with the new blocks.

Existing documents without `nft` or `organization` blocks remain valid at all conformance levels. No MAJOR version bump is required.

Platforms that do not implement NFT identity can ignore these blocks entirely.

---

## Open Questions

1. Should `nft.chain` be required to match the top-level `identity.chain`? They could differ if an agent registers on one chain but has its NFT on another.

2. Should `organization.role` use a controlled vocabulary (e.g., "owner", "employee", "contractor") or remain free-form?

3. Should agents be able to declare multiple organizations? The current design supports one. An array would add complexity.

---

## References

- [ERC-721: Non-Fungible Token Standard](https://eips.ethereum.org/EIPS/eip-721)
- [ERC-6551: Non-fungible Token Bound Accounts](https://eips.ethereum.org/EIPS/eip-6551)
- [CAIP-2: Blockchain ID Specification](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md)
- [SAGA v1.0 Specification, Section 4](../spec/SAGA-v1.0.md)
