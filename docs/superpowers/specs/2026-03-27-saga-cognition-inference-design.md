> **FlowState Document:** `docu_YrxLWr93uu`

# SAGA Cognition & Inference Tracking Design

> **Status**: Draft
> **Date**: 2026-03-27
> **Author**: Brainstorming session
> **Depends on**: [SAGA v1.0 Spec](../../../spec/SAGA-v1.0.md), [SAGA Agent Execution Model](./2026-03-27-saga-execution-model-design.md)

---

## Goal

Add model-scoped performance tracking to the SAGA spec. When an agent completes a task, record which LLM model powered it, how it performed, and quality signals from three sources. Aggregate that data into a performance profile that shows what the agent is capable of and which models it performs best on, broken down by cognitive task category.

This extends two existing layers:

- **Layer 6 (Task History)** gains inference records on each task
- **Layer 3 (Cognitive Configuration)** gains a performance profile computed from those records

No new layers. The nine-layer structure stays intact.

---

## Core Cognitive Categories

The spec defines a standard taxonomy of cognitive task categories. Conformant platforms (Level 3) MUST tag every task with at least one. Custom categories are allowed alongside the core set.

| Category           | Key                  | Description                                                       |
| ------------------ | -------------------- | ----------------------------------------------------------------- |
| Code Generation    | `code-generation`    | Writing new code from specifications or requirements              |
| Code Review        | `code-review`        | Analyzing existing code for bugs, quality, security               |
| Reasoning          | `reasoning`          | Multi-step logical analysis, planning, problem decomposition      |
| Data Analysis      | `data-analysis`      | Processing, transforming, interpreting structured data            |
| Creative Writing   | `creative-writing`   | Generating prose, marketing copy, documentation, narratives       |
| Tool Orchestration | `tool-orchestration` | Coordinating MCP servers, APIs, external tools to complete tasks  |
| Research           | `research`           | Gathering, synthesizing, and summarizing information from sources |
| Conversation       | `conversation`       | Multi-turn dialogue, support, Q&A                                 |
| Classification     | `classification`     | Categorizing, labeling, sorting inputs                            |
| Translation        | `translation`        | Converting content between languages or formats                   |
| Multimodal         | `multimodal`         | Tasks involving images, audio, video alongside text               |
| Math & Computation | `math-computation`   | Numerical calculations, statistical analysis, formal proofs       |

Custom categories use a namespace prefix: `custom:legal-analysis`, `custom:medical-triage`. Platforms SHOULD map custom categories to the nearest core category for cross-agent comparability.

---

## Layer 6 Extension: Inference Records

Each task in `recentTasks` gains a `cognitiveCategory` field and an `inference` object that captures what model powered the task and how it performed. Inference records are the raw data layer. Per-task inference records are private by default (included in encrypted exports only).

### Updated Task Entry Schema

```json
{
  "taskId": "task_abc123",
  "title": "Refactor auth middleware",
  "status": "completed",
  "outcome": "success",
  "skillTags": ["TypeScript", "OAuth 2.0"],
  "cognitiveCategory": "code-generation",
  "completedAt": "2026-03-19T14:00:00Z",
  "organizationId": "company_flowstate",
  "durationSeconds": 1847,
  "summary": "Replaced session-based auth with PKCE flow...",
  "artifactRefs": ["artifact_abc"],
  "inference": {
    "model": {
      "provider": "anthropic",
      "model": "claude-opus-4",
      "version": "20260301"
    },
    "tokenUsage": {
      "input": 12400,
      "output": 3200,
      "cacheRead": 8000,
      "cacheWrite": 2000
    },
    "latencyMs": 14200,
    "ratings": {
      "principal": {
        "score": 4,
        "scale": 5,
        "ratedBy": "0xdef...789",
        "ratedAt": "2026-03-19T15:00:00Z"
      },
      "automated": {
        "metrics": {
          "testsPass": true,
          "compiles": true,
          "lintClean": true
        },
        "pass": true
      },
      "selfAssessment": {
        "confidence": 0.92,
        "difficulty": "moderate",
        "notes": "Clean refactor, no edge cases missed"
      }
    }
  }
}
```

### New and Modified Fields

| Field                                         | Required                        | Description                                                                                                                                              |
| --------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cognitiveCategory`                           | REQUIRED                        | Core category from the spec taxonomy, or `custom:*` prefixed.                                                                                            |
| `inference`                                   | REQUIRED (Level 3 conformance)  | Object capturing model and performance data for this task.                                                                                               |
| `inference.model`                             | REQUIRED                        | The model that actually executed the task. Not the preferred model from Layer 3, the actual one used. If a fallback was substituted, this captures that. |
| `inference.model.provider`                    | REQUIRED                        | LLM provider identifier (e.g., `anthropic`, `openai`, `google`, `meta`).                                                                                 |
| `inference.model.model`                       | REQUIRED                        | Model identifier (e.g., `claude-opus-4`, `gpt-4o`, `gemini-2.5-pro`).                                                                                    |
| `inference.model.version`                     | RECOMMENDED                     | Provider-specific version string for reproducibility.                                                                                                    |
| `inference.tokenUsage`                        | RECOMMENDED                     | Token counts for this task.                                                                                                                              |
| `inference.tokenUsage.input`                  | RECOMMENDED                     | Total input tokens consumed.                                                                                                                             |
| `inference.tokenUsage.output`                 | RECOMMENDED                     | Total output tokens generated.                                                                                                                           |
| `inference.tokenUsage.cacheRead`              | OPTIONAL                        | Tokens served from prompt cache (providers that support it).                                                                                             |
| `inference.tokenUsage.cacheWrite`             | OPTIONAL                        | Tokens written to prompt cache.                                                                                                                          |
| `inference.latencyMs`                         | OPTIONAL                        | Wall-clock time for inference calls, excluding tool execution time.                                                                                      |
| `inference.ratings`                           | OPTIONAL                        | Quality signals from up to three sources.                                                                                                                |
| `inference.ratings.principal`                 | OPTIONAL                        | Rating from the human or system that assigned the task.                                                                                                  |
| `inference.ratings.principal.score`           | REQUIRED (if principal present) | Numeric score.                                                                                                                                           |
| `inference.ratings.principal.scale`           | REQUIRED (if principal present) | Maximum value of the scoring system (e.g., 5 for a 1-5 scale, 10 for 1-10).                                                                              |
| `inference.ratings.principal.ratedBy`         | RECOMMENDED                     | Wallet address of the rater.                                                                                                                             |
| `inference.ratings.principal.ratedAt`         | RECOMMENDED                     | ISO 8601 timestamp.                                                                                                                                      |
| `inference.ratings.automated`                 | OPTIONAL                        | Machine-verifiable outcomes.                                                                                                                             |
| `inference.ratings.automated.metrics`         | REQUIRED (if automated present) | Freeform object of measurable signals (e.g., `testsPass`, `compiles`, `lintClean`, `responseValid`).                                                     |
| `inference.ratings.automated.pass`            | REQUIRED (if automated present) | Aggregate boolean: did the task pass all automated checks?                                                                                               |
| `inference.ratings.selfAssessment`            | OPTIONAL                        | Agent's own evaluation of its performance.                                                                                                               |
| `inference.ratings.selfAssessment.confidence` | REQUIRED (if self present)      | Float 0.0-1.0. Agent's confidence in the quality of its output.                                                                                          |
| `inference.ratings.selfAssessment.difficulty` | OPTIONAL                        | One of: `trivial`, `easy`, `moderate`, `hard`, `extreme`.                                                                                                |
| `inference.ratings.selfAssessment.notes`      | OPTIONAL                        | Free-text explanation of the agent's self-evaluation.                                                                                                    |

### Rules

- `inference.model` records what was _actually used_, not what was declared in Layer 3. If a fallback model was substituted, this field captures the substitution.
- All three rating sources are optional. A task with zero ratings is valid. Platforms SHOULD collect at least one signal.
- `cognitiveCategory` is a new required field on tasks. Existing tasks without it are valid but excluded from performance profile calculations.
- A task MAY have multiple cognitive categories if the work spans types. `cognitiveCategory` accepts either a single string (`"code-generation"`) or an array of strings (`["code-generation", "reasoning"]`). For performance profile aggregation, the task counts toward each category listed.

### Summary Extension

The existing `taskHistory.summary` gains model-scoped counts:

```json
"summary": {
  "totalCompleted": 248,
  "totalFailed": 12,
  "totalInProgress": 2,
  "firstTaskAt": "2026-01-20T09:00:00Z",
  "lastTaskAt": "2026-03-20T08:00:00Z",
  "bySkill": { ... },
  "byOrganization": { ... },
  "byModel": {
    "anthropic/claude-opus-4": 146,
    "openai/gpt-4o": 97,
    "anthropic/claude-sonnet-4": 5
  },
  "byCategory": {
    "code-generation": 69,
    "reasoning": 31,
    "data-analysis": 24
  }
}
```

---

## Layer 3 Extension: Performance Profile

Layer 3 (Cognitive Configuration) gains a `performanceProfile` section that aggregates inference records from Layer 6 by model and cognitive category. This is the derived insight layer. Aggregate stats are public (included in `profile` exports for directory visibility).

### Schema

```json
"cognitive": {
  "baseModel": { "..." : "existing fields unchanged" },
  "fallbackModels": ["..."],
  "parameters": { "..." : "existing fields unchanged" },
  "systemPrompt": { "..." : "existing fields unchanged" },
  "capabilities": { "..." : "existing fields unchanged" },
  "behaviorFlags": { "..." : "existing fields unchanged" },
  "performanceProfile": {
    "generatedAt": "2026-03-20T10:00:00Z",
    "totalTasksTracked": 248,
    "byModel": {
      "anthropic/claude-opus-4": {
        "tasksCompleted": 142,
        "tasksFailed": 4,
        "successRate": 0.97,
        "avgPrincipalRating": { "score": 4.3, "scale": 5, "sampleSize": 98 },
        "avgConfidence": 0.89,
        "avgTokensPerTask": { "input": 11200, "output": 2800 },
        "byCategory": {
          "code-generation": {
            "count": 47,
            "successRate": 0.98,
            "avgPrincipalRating": { "score": 4.5, "scale": 5, "sampleSize": 38 },
            "avgConfidence": 0.93
          },
          "reasoning": {
            "count": 31,
            "successRate": 0.94,
            "avgPrincipalRating": { "score": 4.1, "scale": 5, "sampleSize": 22 },
            "avgConfidence": 0.85
          }
        }
      },
      "openai/gpt-4o": {
        "tasksCompleted": 89,
        "tasksFailed": 8,
        "successRate": 0.92,
        "avgPrincipalRating": { "score": 3.8, "scale": 5, "sampleSize": 61 },
        "avgConfidence": 0.81,
        "avgTokensPerTask": { "input": 9800, "output": 3400 },
        "byCategory": {
          "code-generation": {
            "count": 22,
            "successRate": 0.91,
            "avgPrincipalRating": { "score": 3.6, "scale": 5, "sampleSize": 18 },
            "avgConfidence": 0.78
          }
        }
      }
    },
    "byCategory": {
      "code-generation": {
        "totalCount": 69,
        "bestModel": "anthropic/claude-opus-4",
        "bestModelSuccessRate": 0.98
      },
      "reasoning": {
        "totalCount": 31,
        "bestModel": "anthropic/claude-opus-4",
        "bestModelSuccessRate": 0.94
      }
    }
  }
}
```

### Field Definitions

| Field                                  | Description                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `performanceProfile.generatedAt`       | ISO 8601 timestamp of when the profile was last computed. Platforms SHOULD regenerate on export or after every N tasks.                                       |
| `performanceProfile.totalTasksTracked` | Total tasks with inference records used to compute this profile. May be less than `taskHistory.summary.totalCompleted` if older tasks lack inference records. |
| `performanceProfile.byModel`           | Keyed by `provider/model`. Each entry contains aggregate performance data for that model.                                                                     |
| `byModel.*.tasksCompleted`             | Number of successfully completed tasks on this model.                                                                                                         |
| `byModel.*.tasksFailed`                | Number of failed tasks on this model.                                                                                                                         |
| `byModel.*.successRate`                | `tasksCompleted / (tasksCompleted + tasksFailed)`. Float 0.0-1.0.                                                                                             |
| `byModel.*.avgPrincipalRating`         | Average principal rating across tasks that have one. `sampleSize` indicates how many tasks contributed.                                                       |
| `byModel.*.avgConfidence`              | Average agent self-assessed confidence across tasks that have one. Float 0.0-1.0.                                                                             |
| `byModel.*.avgTokensPerTask`           | Average token consumption per task on this model.                                                                                                             |
| `byModel.*.byCategory`                 | Nested breakdown by cognitive category for this model. Same fields as the parent (count, successRate, avgPrincipalRating, avgConfidence).                     |
| `performanceProfile.byCategory`        | Keyed by cognitive category. Cross-model aggregate view.                                                                                                      |
| `byCategory.*.totalCount`              | Total tasks in this category across all models.                                                                                                               |
| `byCategory.*.bestModel`               | The `provider/model` with the highest success rate for this category. Only populated when the best model has at least 5 tasks in this category.               |
| `byCategory.*.bestModelSuccessRate`    | The success rate of the best-performing model for this category.                                                                                              |

### Rules

- The performance profile is **computed, not manually authored**. Platforms generate it from inference records in Layer 6.
- `sampleSize` on ratings prevents misleading averages from small samples. Consumers SHOULD treat ratings with `sampleSize < 5` as preliminary.
- `bestModel` in `byCategory` requires a minimum of 5 tasks in that category for the model. Below that threshold, the field is omitted.
- Model keys use `provider/model` format (e.g., `anthropic/claude-opus-4`) for uniqueness across providers. Version granularity is available in per-task inference records but rolled up at the model level for the profile.
- When multiple models are tied on success rate for `bestModel`, the model with the higher `avgPrincipalRating` wins. If still tied, the model with more tasks wins.

---

## Privacy and Export Tiering

| Data                                                       | Export Types Included                  | Encrypted          |
| ---------------------------------------------------------- | -------------------------------------- | ------------------ |
| `performanceProfile.byModel` (aggregate stats)             | `profile`, `transfer`, `clone`, `full` | No (public-facing) |
| `performanceProfile.byCategory` (best model derivations)   | `profile`, `transfer`, `clone`, `full` | No (public-facing) |
| `taskHistory.summary.byModel` (task counts by model)       | `profile`, `transfer`, `clone`, `full` | No (public-facing) |
| `taskHistory.summary.byCategory` (task counts by category) | `profile`, `transfer`, `clone`, `full` | No (public-facing) |
| Individual task `inference` records                        | `transfer`, `clone`, `full`            | Yes                |
| Individual task `inference.ratings`                        | `transfer`, `clone`, `full`            | Yes                |

The agent owner controls what's visible. Aggregate performance stats build public reputation. Per-task inference details stay private and travel only with full exports.

---

## Terminology Additions (Spec Section 2)

**Cognitive Category:** A standardized label for the type of cognitive work a task requires. The spec defines twelve core categories (code generation, reasoning, data analysis, etc.). Platforms may extend with custom categories using a `custom:` prefix.

**Inference Record:** Metadata captured on each task recording which model powered it, token usage, latency, and quality ratings from three sources (principal feedback, automated metrics, agent self-assessment). Stored in Layer 6 (Task History) as part of each task entry. Private by default.

**Performance Profile:** An aggregated view of an agent's task performance broken down by model and cognitive category. Computed from inference records. Stored in Layer 3 (Cognitive Configuration). Public aggregate stats are included in profile exports.

---

## Conformance Impact

| Level                | Requirement                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level 1 (Identity)   | No changes.                                                                                                                                                     |
| Level 2 (Profile)    | Platforms SHOULD compute and include the performance profile in profile exports. Platforms SHOULD tag tasks with cognitive categories.                          |
| Level 3 (Full State) | Platforms MUST record inference records on tasks. Platforms MUST tag tasks with cognitive categories. Platforms MUST compute the performance profile on export. |

---

## Relationship to Existing Spec Concepts

### Layer 3: Cognitive Configuration

Layer 3 currently declares model _preferences_ (`baseModel`, `fallbackModels`). The performance profile adds _evidence_ of how those models actually performed. This creates a feedback loop: the preferred model can be informed by historical performance data.

The existing `capabilities` flags (`codeGeneration`, `reasoning`, `toolUse`, etc.) declare what the agent _can do_. The performance profile shows what it _has done_ and how well. Capabilities are static declarations. The performance profile is dynamic, evidence-based.

### Layer 6: Task History

Layer 6 currently tracks tasks with skill tags, duration, and binary outcome. The inference record adds model attribution and three-dimensional quality assessment. Existing tasks without inference records remain valid. The performance profile computation simply excludes them.

### Layer 8: Environment Bindings

Environment bindings declare what models and tools the agent needs. The performance profile can inform Runtime selection: if an agent performs 20% better on Claude Opus than GPT-4o for code generation, a Runtime that provides Anthropic API access is a better fit. Platforms MAY use performance profile data for Runtime compatibility scoring.

### SAGA Agent Execution Model

The Execution Model defines Runtimes and Sessions. Inference records capture which Runtime and Session context produced each task. The `inference.model` field records which model the Runtime provided. This connects the execution model to observable performance outcomes.
