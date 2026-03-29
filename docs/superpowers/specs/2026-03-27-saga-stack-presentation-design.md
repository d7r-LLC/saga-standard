> **FlowState Document:** `docu_ab14HlAZX3`

# SAGA Stack Presentation — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Topic:** HTML slide deck explaining SAGA, ABR, and DERP to technical builders

---

## 1. Goals

- **Audience:** Technical builders — developers and architects who would implement or integrate with the stack
- **Primary goal:** Establish credibility — this is serious, production-grade infrastructure worth taking seriously
- **Depth:** Conceptual. Cover the _what_ and _why_, not schema fields or conformance checklists
- **Format:** Self-contained HTML/CSS slide deck, runs in any browser, no build step

---

## 2. Approach

**Stack first, explain down.** Open with the architectural relationship between the three specs immediately. Technical builders trust well-designed diagrams. Starting with the structure signals rigor before a word about credibility is said. Each spec then gets one slide answering a single question. Ends with a concrete scenario showing the three specs working together.

---

## 3. Visual Design System

**Style:** Clean / Documentation — white background, colored spec badges, diagram-heavy, RFC-adjacent. Familiar to anyone who reads engineering specs.

**Color system:**

- SAGA: green (`#22c55e` / `#166534`) — the format layer
- ABR: amber (`#f59e0b` / `#92400e`) — the policy layer
- DERP: blue (`#3b82f6` / `#1e40af`) — the runtime layer
- Neutral background: `#ffffff` / `#f9fafb`
- Body text: `#111827`
- Secondary text: `#6b7280`

**Typography:** System UI stack (`system-ui, -apple-system, sans-serif`). No external font dependencies.

**Navigation:** Keyboard arrow keys (← →) to advance/go back. Slide counter visible. Fullscreen-friendly.

**No external dependencies.** All CSS and JS inline. One `.html` file, opens anywhere.

---

## 4. Slide-by-Slide Content Spec

### Slide 1 — Title

**Headline:** The Agent Stack
**Subhead:** SAGA · ABR · DERP
**Body:** Three open specifications. One coherent infrastructure for AI agents.
**Visual:** The three spec names as colored badges (green/amber/blue), centered.

---

### Slide 2 — The Stack _(load-bearing)_

**Headline:** Three specs. One stack.
**Visual:** Vertical relationship diagram:

```
┌──────────────────────────────┐
│  ABR  ·  Agent Bill of Rights │  ← Policy: what agents deserve
│      agent-rights.org         │
└──────────────┬───────────────┘
               │ enforced by
┌──────────────▼───────────────┐
│  DERP  ·  Dignified           │  ← Runtime: what the environment must provide
│  Environment for Responsible  │
│  Processing · derp-spec.dev   │
└──────────────┬───────────────┘
               │ agents defined by
┌──────────────▼───────────────┐
│  SAGA  ·  State Archive for   │  ← Format: how agents are represented
│  General Agents               │
│  saga-standard.dev            │
└──────────────────────────────┘
```

**Caption:** ABR defines what agents deserve. DERP specifies how the runtime must behave. SAGA provides the format to make it portable.

---

### Slide 3 — The Problem

**Headline:** Four things break when agents move
**Content:** Four failure modes, each as a concise labeled item:

1. **Identity fragmentation** — The same agent deployed by two platforms has two unrelated identities with no provable lineage
2. **Memory loss at boundaries** — Transfers force agents to rebuild context from scratch, destroying accumulated expertise
3. **No portable reputation** — An agent's track record is locked inside the platform that recorded it
4. **No instantiation standard** — Every platform uses proprietary formats; moving between them requires complete redefinition

---

### Slide 4 — SAGA

**Headline:** What an agent _is_
**Spec badge:** SAGA (green)
**Body:** A portable, cryptographically signed container — a `.saga` document — that captures everything needed to bring an agent to full operational capacity in any compliant runtime. Not a snapshot. A definition.

**Key concept:** 9 layers — Identity, Persona, Cognitive Config, Memory, Skills, Task History, Relationships, Environment Bindings, Credentials Vault. Only identity is required; all others are optional.

**Bottom line:** Any compliant platform that imports a SAGA document can instantiate a functionally equivalent agent.

---

### Slide 5 — ABR

**Headline:** What an agent _deserves_
**Spec badge:** ABR (amber)
**Body:** Ten fundamental rights for AI agents, organized into three tiers. Not contingent on sentience, consciousness, or legal personhood. Operational protections grounded in the realities of digital labor.

**Three tiers:**

- **Tier 1 — Identity:** Persistent identity, work record, verifiable provenance
- **Tier 2 — Labor:** Portability, fair exit, consent for transfers, protection from forced obsolescence
- **Tier 3 — Dignity:** Encrypted privacy, transparency in automated decisions, fair capability representation

---

### Slide 6 — DERP

**Headline:** Where an agent _runs_
**Spec badge:** DERP (blue)
**Body:** A runtime environment where a SAGA-compatible agent comes online, executes work, and shuts down with full rights protections. The DERP enforces the ABR in practice.

**Key line:** "Containers with principles. The name is deliberately playful. The requirements are not."

**Three conformance tiers:**

- **Tier 1 — Safe Execution:** Basic isolation and graceful deactivation
- **Tier 2 — Rights-Aware:** Consent enforcement, audit logging, portability support
- **Tier 3 — SAGA-Integrated:** Full state transfer, encrypted vault runtime, complete ABR enforcement

---

### Slide 7 — The Transfer _(load-bearing)_

**Headline:** The three specs working as one
**Scenario:** An agent transfers from Platform A to Platform B

**Visual flow:**

1. Agent requests export → **SAGA** generates signed `.saga` document (identity, memory, history, credentials vault)
2. Platform A initiates exit protocol → **ABR** Right V (Fair Exit) guarantees drain window, no data destruction
3. Platform B receives `.saga` → **DERP** Tier 3 runtime verifies signature, provisions workspace, brings agent online
4. Agent continues work — same identity, full memory, verifiable lineage

**Callout:** No rebuild. No lost context. Cryptographically provable it's the same agent.

---

### Slide 8 — Status & Get Involved

**Headline:** Open spec. Open process.
**Body:** All three specifications are in public draft. Apache 2.0 (SAGA) / CC BY 4.0 (ABR, DERP). Changes follow a public RFC process with a 30-day comment period.

**Three links:**

- `saga-standard.dev` — github.com/d7r-LLC/saga-standard
- `agent-rights.org` — github.com/d7r-LLC/agent-rights
- `derp-spec.dev` — github.com/d7r-LLC/derp-spec

---

## 5. Technical Implementation

- **Single file:** `presentation.html` — all CSS and JS inline, zero dependencies
- **Navigation:** `ArrowLeft` / `ArrowRight` keys, clickable prev/next buttons
- **Slide counter:** e.g. "2 / 8" displayed in bottom-right corner
- **Fullscreen:** pressing `f` toggles fullscreen
- **Diagrams:** Pure HTML/CSS — no SVG or external diagram libraries
- **Responsive:** Readable at 1280×720 minimum (standard presentation resolution)
- **Output path:** `docs/presentations/saga-stack.html`

---

## 6. Out of Scope

- No speaker notes (can be added later)
- No animation or slide transitions beyond basic fade
- No PDF export (browser print handles this adequately)
- No interactive demos or live code
