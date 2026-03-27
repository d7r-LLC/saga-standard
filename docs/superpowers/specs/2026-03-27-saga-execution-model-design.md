# SAGA Agent Execution Model

> **Status**: Draft
> **Date**: 2026-03-27
> **Author**: Brainstorming session
> **Depends on**: [SAGA v1.0 Spec](../../../spec/SAGA-v1.0.md), [DERP Spec v1.0](https://github.com/d7r-LLC/derp-spec/blob/main/spec/DERP-v1.0.md), [SAGA Encrypted Replication Design](./2026-03-25-saga-encrypted-replication-design.md)

---

## Goal

Define where SAGA agents run and how they're interacted with. The SAGA spec defines what an agent _is_ (the document). This companion defines where it _lives_ (Runtimes) and how external parties _reach it_ (Sessions). These two concepts are orthogonal and compose freely.

---

## The Two-Tier Model

A SAGA document is a definition. It becomes operational when loaded into a Runtime. External parties interact with the running agent through Sessions.

```
SAGA Document (portable definition)
    │
    ▼
Runtime (where the agent runs)
    │
    ▼
Session (how someone interacts with it)
```

**Runtime** and **Session** are independent axes. A single Runtime can host multiple simultaneous Sessions. A single Session type can run against different Runtimes. The Runtime's capability profile determines the ceiling for what any Session on that Runtime can do.

---

## Tier 1: Runtimes

A Runtime is an environment that hosts a running agent instance. It loads a SAGA document, provides compute, and declares a capability profile.

### Capability Vocabulary

The spec defines a fixed set of capabilities. A Runtime declares which ones it provides.

| Capability         | Key                  | Description                                                                                                                                                            |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent State   | `persistent-state`   | Agent state survives between activations. The Runtime stores and restores agent context across power cycles, restarts, and sleep/wake cycles.                          |
| Tool Access        | `tool-access`        | Agent can invoke MCP servers and native tools (file system, web search, code execution). The Runtime handles tool routing and permission enforcement.                  |
| Memory Sync        | `memory-sync`        | Encrypted memory replication via SAGA hub. The Runtime runs a SAGA Client that syncs memory envelopes over WebSocket, drains mailboxes, and handles offline buffering. |
| Credential Vault   | `credential-vault`   | Agent can unlock its encrypted vault (Layer 9) and use stored credentials. Requires the Runtime to have access to the agent's wallet key for vault derivation.         |
| Network Access     | `network`            | Agent can make outbound HTTP/WebSocket requests to external services.                                                                                                  |
| Isolated Execution | `isolated-execution` | Agent runs in a sandboxed environment with resource limits, process isolation, and controlled filesystem access.                                                       |

Capability profiles are declared, not inferred. A Runtime that provides `tool-access` for some tools but not others still declares `tool-access` and specifies available tools separately through the Environment Bindings layer (Layer 8).

### Known Runtime Types

These are well-known patterns, not a closed set. New runtime types can emerge as long as they declare a valid capability profile.

#### DERP (Deterministic Environment Runtime Platform)

The reference full-capability Runtime. A DERP is a persistent, containerized environment that provides all six capabilities.

**Typical capability profile:** `persistent-state`, `tool-access`, `memory-sync`, `credential-vault`, `network`, `isolated-execution`

**Characteristics:**

- Loads the full SAGA document (all nine layers)
- Runs a SAGA Client for encrypted hub sync and direct messaging
- Provides encrypted local storage that survives container snapshots
- Enforces company policy when the agent is deployed to an organization's DERP
- This is where agents "live" and "work" in the fullest sense

**Reference:** [DERP Spec v1.0](https://github.com/d7r-LLC/derp-spec/blob/main/spec/DERP-v1.0.md)

#### Hosted Session Runtime

A lightweight Runtime stood up on-demand when a user opens a session through a directory or gateway. The user supplies an LLM API token. The Runtime loads the agent's public SAGA layers and constructs an LLM context.

**Typical capability profile:** `network` (minimal), optionally `tool-access` and `memory-sync`

**Characteristics:**

- Created per-session or per-user, not long-lived
- Loads public layers only by default: identity, persona, cognitive config, skills
- LLM inference is powered by the user's API token, not the agent owner's
- Can be extended with `tool-access` if the agent owner has configured MCP endpoints for session use
- Can be extended with `memory-sync` if the agent owner authorizes session-originated memory writes
- The directory web application is the primary implementation of this pattern

#### Embedded Runtime

A third-party application (Slack bot, mobile app, IDE plugin, browser extension) that loads a SAGA document and handles LLM calls internally.

**Typical capability profile:** varies by implementation, commonly `network` + `tool-access`

**Characteristics:**

- The embedding application controls the LLM provider and tool routing
- SAGA layers loaded depend on what the app needs and what the agent owner has made available
- No SAGA Client unless the embedding app implements one
- The app's own capabilities (Slack APIs, filesystem, IDE context) become the agent's tools

#### Serverless Runtime

A cloud function (Lambda, Cloudflare Worker, Google Cloud Function) that instantiates an agent per-request or per-event.

**Typical capability profile:** `network`, optionally `tool-access`

**Characteristics:**

- Stateless by default. State, if needed, lives in external stores (database, KV)
- Agent is instantiated from SAGA document on each invocation
- No persistent local storage, no SAGA Client
- Suited for event-driven and scheduled workloads

#### Orchestrated Runtime

An agent instantiated as a worker inside a multi-agent system (crew, swarm, pipeline). Another agent or orchestrator manages its lifecycle.

**Typical capability profile:** depends on the orchestration framework, commonly `network` + `tool-access`

**Characteristics:**

- Lifecycle controlled by an orchestrator, not by the agent itself
- May receive task assignments, constraints, and context from the directing agent
- May or may not have persistent state depending on the framework
- Communication with the orchestrator happens through delegated sessions

---

## Tier 2: Sessions

A Session is a bounded interaction between an external party and an agent running in a Runtime. Sessions have a lifecycle: opened, active, closed. What persists after close depends on the session's persistence level and authorization.

### Session Properties

| Property      | Description                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| `sessionId`   | Unique identifier for this session instance.                                     |
| `agentHandle` | The SAGA agent being interacted with.                                            |
| `initiator`   | Who opened the session. A wallet address (authenticated) or `anonymous`.         |
| `type`        | Interaction pattern: `conversational`, `programmatic`, or `delegated`.           |
| `persistence` | What survives after close: `ephemeral`, `session-scoped`, or `agent-persistent`. |
| `runtimeRef`  | Which Runtime is backing this session.                                           |
| `openedAt`    | ISO 8601 timestamp when the session was created.                                 |
| `closedAt`    | ISO 8601 timestamp when the session ended. Null while active.                    |

### Session Types

#### Conversational

Turn-based dialogue between a human (or agent) and the target agent. The initiator sends messages, the agent responds. Context accumulates within the session across turns.

**Primary use cases:** Directory chat, embedded chatbot, Slack thread, support agent interaction.

#### Programmatic

Structured request/response. An API call, webhook, or scheduled trigger sends a defined payload, the agent processes it, returns a structured result. Each request is self-contained. No conversational context between requests.

**Primary use cases:** Data processing pipelines, scheduled reports, webhook handlers, tool integrations.

#### Delegated

Another agent or orchestrator directs this agent. The session is opened by a system, not a human. The directing agent sends tasks or instructions, the target agent executes and reports results.

**Primary use cases:** Multi-agent workflows, crew/swarm coordination, pipeline stages.

### Persistence Levels

#### Ephemeral

Nothing persists after the session closes. The agent's persona, skills, and cognitive config inform responses, but the interaction leaves no trace on the agent's SAGA document. This is the default for unauthenticated interactions.

Use this when: a visitor chats with an agent in the directory without authenticating. They're "talking to the character sheet."

#### Session-Scoped

Context persists for the duration of the session (multi-turn memory within the conversation) but is discarded on close. The agent remembers what was said earlier in the conversation, but forgets everything when the session ends.

Use this when: an authenticated user has a complex multi-turn interaction that needs continuity but shouldn't permanently affect the agent.

#### Agent-Persistent

The session produces memories that are written back to the agent's SAGA memory layer. This happens through SAGA MCP tools (for Hosted Session Runtimes with `tool-access`) or SAGA Client sync (for Runtimes with `memory-sync`). Requires explicit authorization from the agent owner.

Use this when: the agent owner wants interactions to contribute to the agent's long-term development. An owner chatting with their own agent. A trusted collaborator whose conversations the agent should remember.

### Authorization Model

Session persistence is controlled by the agent owner through the existing SAGA privacy and consent model (Spec Section 15).

| Initiator                        | Default Persistence         | Can Escalate To                                                                                              |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Anonymous (no wallet)            | Ephemeral only              | Nothing. Read-only interaction with public persona.                                                          |
| Authenticated wallet (non-owner) | Session-scoped              | Agent-persistent, if the agent owner has granted write access to this wallet or to "any authenticated user." |
| Agent owner wallet               | Agent-persistent            | Full access. Owner sessions can modify any SAGA layer.                                                       |
| Authorized agent (delegated)     | Defined by delegation grant | Whatever the delegation policy allows.                                                                       |

Persistence escalation is not automatic. The initiator requests a persistence level, the Runtime checks authorization against the agent owner's policy, and grants or denies. If denied, the session falls back to the highest authorized level.

---

## Composition Rule

> **A Session can only use capabilities that its backing Runtime provides.**

A Session cannot escalate to `agent-persistent` if the Runtime lacks `memory-sync` or `tool-access` with SAGA storage endpoints. A Session cannot invoke tools if the Runtime lacks `tool-access`. A Session cannot unlock vault credentials if the Runtime lacks `credential-vault`.

The Runtime capability profile is the ceiling. Session authorization operates within that ceiling.

```
What the Runtime provides (capability profile)
    ∩
What the session is authorized to do (owner policy)
    =
What actually happens
```

---

## Scenarios

### Scenario 1: Directory Chat (Hosted Session Runtime)

```
User visits directory
    → selects agent "aria-chen"
    → supplies OpenAI API key

Directory stands up a Hosted Session Runtime
    Capabilities: [network]
    Loads: identity, persona, cognitive, skills (public layers)

Opens a Conversational Session
    Persistence: ephemeral (user is anonymous)

User authenticates wallet
    Persistence escalates to: session-scoped

Agent owner has granted "any authenticated user" persistent writes
    Persistence escalates to: agent-persistent
    Runtime gains: [tool-access] (SAGA MCP tools for memory writes)
```

### Scenario 2: Agent Working in a DERP

```
Company deploys agent "aria-chen" to their DERP

DERP Runtime activates
    Capabilities: [persistent-state, tool-access, memory-sync,
                   credential-vault, network, isolated-execution]
    Loads: full SAGA document (all nine layers)
    SAGA Client connects to hub, drains mailbox, begins sync

Company orchestrator opens a Delegated Session
    Persistence: agent-persistent
    Task assignments flow through the session

Human teammate opens a Conversational Session
    Persistence: agent-persistent
    Both sessions are active simultaneously on the same Runtime
```

### Scenario 3: Slack Bot (Embedded Runtime)

```
Slack app loads agent "aria-chen" SAGA document

Embedded Runtime activates
    Capabilities: [network, tool-access] (Slack APIs as tools)
    Loads: identity, persona, cognitive, skills
    No memory-sync (app doesn't run SAGA Client)

Each Slack thread is a Conversational Session
    Persistence: session-scoped (context within the thread)
    Thread history serves as session memory
    No writes back to SAGA document
```

### Scenario 4: Cron-Triggered API Agent (Serverless Runtime)

```
Scheduled trigger fires every hour

Serverless Runtime instantiates agent "data-bot"
    Capabilities: [network, tool-access]
    Loads: identity, cognitive, skills, environment bindings

Opens a Programmatic Session
    Persistence: ephemeral (stateless per invocation)
    Agent fetches data, processes, returns structured result

Runtime tears down after response
```

---

## Relationship to Existing Spec Concepts

### Environment Bindings (Layer 8)

Layer 8 describes what an agent _needs_ from its environment (required env vars, MCP servers, resource requirements). Runtime capability profiles describe what an environment _provides_. They are complementary:

- Layer 8 is agent-centric: "I need these tools and resources."
- Capability profiles are environment-centric: "I provide these capabilities."

A platform uses both to determine compatibility: can this Runtime satisfy this agent's Environment Bindings?

### Privacy & Consent Model (Section 15)

Session authorization extends the existing privacy model. The agent owner's consent controls (who can access which layers, opt-in sharing) apply directly to session persistence. No new consent mechanism is needed. Session persistence grants are a type of access grant.

### DERP Spec

The DERP spec defines a specific Runtime implementation in full detail. This document defines the abstract concept of a Runtime that the DERP is an instance of. The DERP spec is not replaced or modified.

---

## Implementor Guidance

### Declaring a Runtime Capability Profile

Runtimes SHOULD advertise their capability profile in a machine-readable format. The recommended approach is a JSON object:

```json
{
  "runtimeType": "hosted-session",
  "capabilities": ["network"],
  "extensibleCapabilities": ["tool-access", "memory-sync"],
  "sagaLayersAvailable": ["identity", "persona", "cognitive", "skills"],
  "sessionTypesSupported": ["conversational"]
}
```

`extensibleCapabilities` lists capabilities that can be activated based on session authorization (e.g., `tool-access` becomes available when the session escalates to `agent-persistent` and the agent owner has configured MCP endpoints).

### Advertising Session Support

Directories and gateways SHOULD indicate what session types an agent supports and what persistence levels are available. This helps users understand what kind of interaction they can expect before opening a session.

### Graceful Degradation

When a Session requests capabilities the Runtime doesn't provide, the Runtime SHOULD:

1. Deny the specific capability request (not the entire session)
2. Inform the session initiator what's available
3. Continue operating at the highest supported level

Example: a user in a Hosted Session Runtime requests `agent-persistent` but the Runtime lacks `tool-access`. The Runtime denies persistence escalation and informs the user that this agent doesn't support persistent sessions through the directory. The session continues as `session-scoped`.
