# Contracts-Focused Audit Brief — 2026-05-03

This directory contains the focused-audit brief for a smart-contract-only review of the SAGA standard contracts (`packages/contracts/`).

It is **input** to the `saga audit` CLI tool, not output. After running the CLI, the response will land in `audits/<run-timestamp>/`.

## Files

| File        | Purpose                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `system.md` | Auditor persona — Solidity-specialist tuning, references the standards the LLM should cross-check against.   |
| `prompt.md` | Engagement scope, already-remediated exclusions, priority dimensions A–I, and the required output structure. |
| `README.md` | This file — invocation cheatsheet + rationale.                                                               |

## Why a focused brief

The default `saga audit --preset security` runs an end-to-end audit of every package in the repo. For the smart-contract layer specifically, that's wasteful: most of the bundled context (server, SDK, CLI, mobile) is irrelevant, and the LLM splits attention across surfaces that are governed by completely different threat models.

The focused brief:

1. Restricts the bundle to `packages/contracts/` (smaller, denser context).
2. Loads a Solidity-specialist persona that knows the OpenZeppelin v5.x API, ERC-6551 quirks, and the EEA EthTrust v3 specification.
3. Pre-declares what's **already remediated** so the LLM doesn't burn tokens re-flagging closed findings.
4. Lists **9 priority dimensions** (access control, namespace integrity, TBA, transfer semantics, input validation, toolchain, test coverage, deployment, spec alignment) — each with concrete questions the LLM is expected to answer.
5. Requires output that maps back to specific reference standards (EthTrust v3, EIP-721, EIP-6551, OZ docs).

## Run it

### One provider (Anthropic, default)

```bash
cd ~/code/epic/saga-standard
pnpm --filter @d7r/saga-cli build      # ensure CLI is fresh

node packages/cli/dist/index.js audit \
  --target packages/contracts \
  --system-file audits/2026-05-03-contracts-focused/system.md \
  --prompt-file audits/2026-05-03-contracts-focused/prompt.md \
  --provider anthropic \
  --model claude-opus-4-7 \
  --max-tokens 16000 \
  --out-dir audits
```

### Three-way comparison (Anthropic + OpenAI + Gemini)

Run sequentially (token costs are linear, not parallel):

```bash
for PROVIDER in anthropic openai gemini; do
  node packages/cli/dist/index.js audit \
    --target packages/contracts \
    --system-file audits/2026-05-03-contracts-focused/system.md \
    --prompt-file audits/2026-05-03-contracts-focused/prompt.md \
    --provider $PROVIDER \
    --max-tokens 16000 \
    --out-dir audits
done
```

This produces three responses; compare them the way the 2026-05-03 three-way comparison did. Findings that appear in **all three** are highest-confidence; findings that appear in only one merit a second look (could be insight, could be hallucination).

### Dry run (verify the bundle before paying for tokens)

```bash
node packages/cli/dist/index.js audit \
  --target packages/contracts \
  --system-file audits/2026-05-03-contracts-focused/system.md \
  --prompt-file audits/2026-05-03-contracts-focused/prompt.md \
  --dry-run
```

Prints bundle stats (token estimate, file count, MB) and the first / last bundled lines so you can confirm the contracts and tests both made it in.

## Bundle expectations

`packages/contracts/` is small. Expected bundle:

- ~6 source files (`.sol`)
- ~6 test files (`.t.sol`)
- 3 deploy scripts
- `foundry.toml`, `remappings.txt`
- Plus the foundry submodules in `lib/` (these get filtered by the default exclude list — but if they slip in, add `--exclude lib`)

Total bundled size should be under 200 KB / ~50K tokens. Plenty of headroom under the 1M context window for a long detailed response.

## After the run

Each provider produces:

- `audits/<run-timestamp>-<provider>-<model>/prompt.md` — the assembled prompt
- `audits/<run-timestamp>-<provider>-<model>/response.md` — the audit findings

Compare against the prior 2026-05-03 three-way audit (`audits/2026-05-03-three-way-comparison/`) to confirm previously-remediated items DO NOT reappear in this run, and to see what new issues a contracts-focused lens surfaces.

## Reference standards cited in the prompt

- [EEA EthTrust Security Levels v3](https://entethalliance.org/specs/ethtrust-sl/) — March 2025; modern replacement for SWC registry.
- [EIP-721 — NFT Standard](https://eips.ethereum.org/EIPS/eip-721)
- [EIP-6551 — Token Bound Accounts](https://eips.ethereum.org/EIPS/eip-6551)
- [OpenZeppelin Contracts v5.x docs](https://docs.openzeppelin.com/contracts/5.x/)
- [Solidity 0.8.x known bugs](https://docs.soliditylang.org/en/latest/bugs.html)
- [OpenZeppelin Ownable2Step](https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable2Step)
- [Code4rena Canto Identity audit (2023)](https://code4rena.com/reports/2023-03-canto-identity) — most analogous prior engagement
- [Cyfrin / Solodit checklist](https://www.cyfrin.io/blog/solodit-checklist-explained-4-front-running-attacks)
