---
title: Examples
order: 5
description: 'Practical examples for working with the documentation site'
---

## Adding Documentation to a New Package

This example walks through enabling documentation for a hypothetical package called `flowstate-app-analytics`.

### Step 1: Configure the Package

Add a `documentation` section to the package's `.flowstate/config.json`:

```json
{
  "projectId": "proj_abc123xyz0",
  "orgId": "org_9f3omFEY2H",
  "workspaceId": "work_ojk4TWK5D2",
  "documentation": {
    "enabled": true,
    "type": "app",
    "title": "Analytics",
    "description": "Business analytics and reporting dashboards",
    "category": "apps",
    "order": 5
  }
}
```

For library packages that export TypeScript APIs, set `"type": "library"` to enable automatic TSDoc extraction.

### Step 2: Create the Documentation Files

Create `.flowstate/docs/index.md` (required) and any additional pages:

```text
packages/flowstate-app-analytics/.flowstate/docs/
  index.md            # Overview page (required)
  getting-started.md  # Getting started guide
  features.md         # Feature overview
  changelog.md        # Release notes
  workflows/
    common-workflow/
      index.md        # Workflow documentation
```

Each file needs YAML frontmatter:

```yaml
---
title: Analytics
order: 1
description: "Business analytics and reporting dashboards"
---

Overview content goes here.

## Features

- Real-time dashboards
- Custom report builder
```

### Step 3: Run the Sync

```bash
yarn workspace @epicdm/flowstate-docs docs:sync
```

Output:

```text
=== Documentation Sync ===
Discovering packages with documentation...
Found 25 package(s) with documentation:
  - Analytics (flowstate-app-analytics) [apps]
  ...

Copying documentation files...
Copying docs: flowstate-app-analytics
```

The package's docs are now at `packages/documentation/src/app/docs/flowstate-app-analytics/` and appear in the navigation sidebar under the "Sub Apps" group.

## Mapping a Package to a Navigation Group

By default, packages are assigned to a navigation group based on the `CATEGORY_TO_DEFAULT_GROUP` mapping:

| Category         | Default Group      |
| ---------------- | ------------------ |
| `standard`       | FlowState Standard |
| `infrastructure` | Infrastructure     |
| `apps`           | Sub Apps           |
| `services`       | Core Utilities     |
| `core`           | Core Utilities     |
| `integrations`   | Core Utilities     |
| `tools`          | Tools & CLI        |

For explicit control, add an entry to the `PACKAGE_TO_GROUP` map in `scripts/navigation.ts`:

```typescript
const PACKAGE_TO_GROUP: Record<string, string> = {
  // ...existing entries...
  'flowstate-app-analytics': 'sub-apps',
}
```

## Writing a Library Package's TSDoc for API Generation

For packages with `type: "library"`, the sync pipeline extracts TSDoc comments from exported declarations and generates API reference pages.

### Interface Example

````typescript
/**
 * Configuration for an analytics dashboard widget.
 *
 * @example
 * ```typescript
 * const config: WidgetConfig = {
 *   id: 'revenue-chart',
 *   type: 'line-chart',
 *   dataSource: 'monthly-revenue',
 * }
 * ```
 */
export interface WidgetConfig {
  /** Unique widget identifier */
  id: string
  /** Display type for the widget */
  type: 'line-chart' | 'bar-chart' | 'table' | 'metric'
  /** Data source key to query */
  dataSource: string
  /** Optional refresh interval in milliseconds */
  refreshInterval?: number
}
````

This generates a table in `api/interfaces/page.md`:

| Property          | Type                                                 | Required | Description                               |
| ----------------- | ---------------------------------------------------- | -------- | ----------------------------------------- |
| `id`              | `string`                                             | Yes      | Unique widget identifier                  |
| `type`            | `'line-chart' \| 'bar-chart' \| 'table' \| 'metric'` | Yes      | Display type for the widget               |
| `dataSource`      | `string`                                             | Yes      | Data source key to query                  |
| `refreshInterval` | `number`                                             | No       | Optional refresh interval in milliseconds |

### Function Example

````typescript
/**
 * Aggregate metric data over a time range.
 *
 * @param dataSource - The data source identifier
 * @param startDate - Start of the time range
 * @param endDate - End of the time range
 * @returns Aggregated metric values for the period
 *
 * @example
 * ```typescript
 * const metrics = await aggregateMetrics('revenue', startOfMonth, endOfMonth)
 * ```
 */
export async function aggregateMetrics(
  dataSource: string,
  startDate: Date,
  endDate: Date,
): Promise<MetricResult[]> {
  // implementation
}
````

This generates a function reference with signature, parameter table, and return type documentation.

## Using Custom Markdoc Tags in Documentation

### Callouts for Notes and Warnings

Use callouts to highlight important information:

```text
{% callout title="Database Migration" type="warning" %}
Running this command will modify the database schema. Back up your data first.
{% /callout %}

{% callout title="Tip" %}
You can use the `--dry-run` flag to preview changes without applying them.
{% /callout %}
```

### Quick Links for Feature Navigation

Group related links on overview pages:

```text
{% quick-links %}

{% quick-link title="Dashboard Setup" icon="installation" href="/docs/flowstate-app-analytics/getting-started" description="Configure your first analytics dashboard with data sources and widgets." /%}

{% quick-link title="Custom Reports" icon="plugins" href="/docs/flowstate-app-analytics/features" description="Build custom reports with filters, grouping, and export options." /%}

{% /quick-links %}
```

## Working with Relative Links

Documentation pages commonly link to other pages within the same package or across packages. The sync pipeline rewrites relative links to absolute paths.

In your source `.flowstate/docs/index.md`:

```text
See the [Installation guide](./installation) for setup instructions.
Check the [MCP Server docs](../flowstate-mcp) for API integration.
```

After sync, these become:

```text
See the [Installation guide](/docs/flowstate-app-analytics/installation) for setup instructions.
Check the [MCP Server docs](/docs/flowstate-mcp) for API integration.
```

The rewriting rules:

- `./path` becomes `/docs/{current-package-slug}/path`
- `../other-package` becomes `/docs/other-package`

## Customizing the Color Theme

The documentation site supports five accent color themes. Users select their preference via the UI, and the choice is persisted in localStorage under the key `epic-color-theme`.

Available themes:

| Theme    | Primary Color | CSS Variable      |
| -------- | ------------- | ----------------- |
| `amber`  | `#ff7700`     | `--theme-primary` |
| `blue`   | `#00c3ff`     | `--theme-primary` |
| `green`  | `#55ff00`     | `--theme-primary` |
| `purple` | `#aa00ff`     | `--theme-primary` |
| `red`    | `#ff0000`     | `--theme-primary` |

Each theme sets three CSS custom properties on `document.documentElement`: `--theme-primary`, `--theme-light`, and `--theme-dark`, plus a `data-color-theme` attribute for CSS selectors.

## Testing Agent Endpoints

The site serves machine-readable documentation for AI agents:

```bash
# Fetch the agent index
curl https://docs.example.com/llms.txt

# Fetch the full agent documentation
curl https://docs.example.com/llms-full.txt

# Fetch a specific agent topic
curl https://docs.example.com/agent/setup
curl https://docs.example.com/agent/mcp-tools
curl https://docs.example.com/agent/entities
```

To test the AI agent redirect middleware locally:

```bash
# Simulates a ChatGPT crawler visiting the docs
curl -H "User-Agent: ChatGPT-User" http://localhost:3000/docs/flowstate-process
# Returns 302 redirect to /llms.txt

# Bypass redirect with human parameter
curl -H "User-Agent: ChatGPT-User" "http://localhost:3000/docs/flowstate-process?human=true"
# Returns the normal HTML page
```
