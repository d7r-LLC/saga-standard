# Contributing to SAGA

SAGA is an open specification. Contributions are welcome from any individual, company, or organization.

---

## Ways to Contribute

**Report issues.** If you find an ambiguity, error, or gap in the spec, open a GitHub issue. Clear problem statements are the most valuable contribution.

**Propose changes.** Non-trivial changes go through the RFC process (see below). Trivial fixes (typos, formatting, clarifications that don't change behavior) can be submitted as PRs directly.

**Implement and report back.** Building a SAGA-compliant platform and hitting friction is signal. Open an issue describing what was hard and what you had to interpret.

**Join the Working Group.** The Working Group reviews RFCs and votes on changes. Participation is open. See the Working Group section below.

---

## RFC Process

All non-trivial changes to the specification go through the RFC process.

### What requires an RFC

- New fields, layers, or required properties
- Changes to the Transfer or Clone Protocol
- Changes to conformance requirements
- Changes to cryptographic schemes
- New export types
- Any change that could break existing implementations

### What does not require an RFC

- Typo fixes
- Formatting changes
- Clarifications that don't change normative behavior (MUST/SHOULD/MAY)
- Additions to appendices that are explicitly non-normative

### Submitting an RFC

1. **Open an issue first.** Describe the problem you're solving and your proposed direction. This is the place for early feedback before you write the full RFC.

2. **Write the RFC.** Copy `rfcs/0000-template.md` to `rfcs/0000-your-title.md`. Fill it out completely.

3. **Submit a PR.** Open a pull request adding your RFC file. The PR description should summarize the change and link to the issue.

4. **30-day comment period.** The PR stays open for at least 30 days. Anyone may comment. The author is expected to respond to substantive feedback.

5. **Working Group review.** After the comment period, the Working Group reviews the RFC and votes.
   - MINOR and PATCH changes require a simple majority.
   - MAJOR changes (breaking) require a 2/3 supermajority.

6. **Merge or close.** Accepted RFCs are merged to `main`. Closed RFCs are kept for historical reference.

### RFC Template

See [rfcs/0000-template.md](rfcs/0000-template.md).

---

## Working Group

The SAGA Working Group governs the specification. It consists of:

- Representatives from platforms that have implemented SAGA
- Individual contributors with significant participation in the RFC process
- FlowState (founding steward, holds one vote)

**Joining:** Open an issue titled "Working Group membership request" with a brief description of your interest and any relevant implementation work.

**Voting:** Working Group votes happen in GitHub discussions. Each member gets one vote. Votes are recorded publicly.

**Founding steward:** FlowState holds stewardship for SAGA v1.x. Stewardship transfers to an independent governance body at v2.0.

---

## Code of Conduct

Participation in this project requires treating others with respect. Debates about technical tradeoffs are welcome. Personal attacks, harassment, and bad-faith arguments are not.

Maintainers may remove comments or contributions that violate this standard without warning.

---

## Questions

Open an issue or email saga@flowstate.ai.
