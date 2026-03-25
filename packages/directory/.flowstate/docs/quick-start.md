---
title: Quick Start
order: 3
description: 'Running the documentation site locally and syncing content from the monorepo'
---

## Running the Dev Server

From the monorepo root:

```bash
yarn workspace @epicdm/flowstate-docs dev
```

This starts the Next.js development server (default port 3000). The site hot-reloads when you edit `.md` pages in `src/app/docs/`.

## Syncing Documentation

Before the site has any content, you need to run the documentation sync pipeline. This discovers packages across the monorepo, copies their docs, extracts TSDoc from library packages, and generates the navigation manifest.

```bash
yarn workspace @epicdm/flowstate-docs docs:sync
```

The sync is also wired as a `prebuild` hook, so `yarn build` runs it automatically.

### What the Sync Produces

After running `docs:sync`, the following are generated:

| Output                               | Description                                                        |
| ------------------------------------ | ------------------------------------------------------------------ |
| `src/app/docs/{package-slug}/`       | Copied documentation pages from each package's `.flowstate/docs/`  |
| `src/app/docs/{package-slug}/api/`   | Generated API reference from TSDoc (library packages only)         |
| `src/app/docs/flowstate-method/`     | FlowState Method documentation (7 phases + index)                  |
| `src/app/docs/flowstate-process/`    | Process & Methodology (FlowState Standard, dev process, etc.)      |
| `src/app/docs/flowstate-standards/`  | Standards & Reference (architecture, quality, TDD, security, etc.) |
| `src/app/docs/flowstate-deployment/` | Deployment & Docker documentation                                  |
| `src/lib/navigation.generated.json`  | Navigation manifest consumed by the sidebar                        |
| `src/agent/llms-full.txt`            | Concatenated agent documentation for `/llms-full.txt`              |

## Adding a New Documentation Page

All content pages are Markdoc (`.md`) files with YAML frontmatter. To add a page to an existing package:

1. Create a new `.md` file in the package's `.flowstate/docs/` directory:

```text
---
title: My New Page
order: 5
description: "Description for navigation and SEO"
---

## Section Heading

Your content here using standard Markdown syntax.
```

2. Re-run the sync:

```bash
yarn workspace @epicdm/flowstate-docs docs:sync
```

3. The page appears in the navigation sidebar under its package.

## Using Markdoc Custom Tags

The site provides custom Markdoc tags beyond standard Markdown:

### Callout

```text
{% callout title="Important" type="warning" %}
This is a warning callout. The `type` can be "note" (default) or "warning".
{% /callout %}
```

### Figure

```text
{% figure src="/images/screenshot.png" alt="Description" caption="Figure caption text" /%}
```

### Quick Links

```text
{% quick-links %}
{% quick-link title="Link Title" icon="installation" href="/docs/some-page" description="Brief description." /%}
{% quick-link title="Another Link" icon="plugins" href="/docs/other-page" description="Another description." /%}
{% /quick-links %}
```

Available icon values: `installation`, `presets`, `plugins`, `theming`, `lightbulb`, `warning`.

### Diagrams

```text
{% method-diagram /%}
{% app-suite-diagram /%}
```

These render the FlowState Method and App Suite interactive diagrams respectively.

## Writing Frontmatter

Every `.md` page requires YAML frontmatter:

```yaml
---
title: Page Title
order: 3
description: 'Brief description for SEO and navigation'
---
```

| Field         | Required | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| `title`       | Yes      | Page title displayed in the header and sidebar  |
| `order`       | No       | Sort position within the package (default: 999) |
| `description` | No       | SEO meta description                            |

Pages are sorted: Overview (empty slug) first, Getting Started second, Features third, then by `order`, with Changelog last.

## Building for Production

```bash
yarn workspace @epicdm/flowstate-docs build
```

This runs `docs:sync` (via `prebuild`), then `next build` to produce the production output.

## Deploying to Cloudflare

### Preview locally

```bash
yarn workspace @epicdm/flowstate-docs preview
```

This builds with OpenNext and runs a local Cloudflare Workers preview.

### Deploy to staging

```bash
yarn workspace @epicdm/flowstate-docs deploy:staging
```

### Deploy to production

```bash
yarn workspace @epicdm/flowstate-docs deploy:production
```

## Using the Search

The documentation site includes full-text search:

- Press **Cmd+K** (macOS) or **Ctrl+K** (Windows/Linux) to open the search dialog
- Results are ranked by relevance using FlexSearch
- The search index is built at compile time from all `page.md` files and updates on each build

## Next Steps

- [API Reference](/docs/documentation/api) - Complete reference for scripts, components, and configuration
- [Examples](/docs/documentation/examples/basic-usage) - Practical examples for common tasks
