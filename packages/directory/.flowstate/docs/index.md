---
title: 'Documentation Site'
order: 1
description: 'Next.js documentation site for Epic FlowState with Markdoc content, FlexSearch indexing, and AI agent endpoints'
---

The `@epicdm/flowstate-docs` package is the documentation site for the Epic FlowState platform. It is a Next.js 15 application that uses Markdoc for content rendering, FlexSearch for client-side search, and deploys to Cloudflare Workers via OpenNext. The site aggregates documentation from across the entire monorepo through an automated sync pipeline.

## Architecture

The documentation site operates in two phases: a build-time sync pipeline that collects and transforms content from across the monorepo, and a runtime Next.js application that renders it.

### Build-Time Sync Pipeline

The `docs:sync` script (`scripts/sync-docs.ts`) orchestrates a six-step pipeline:

1. **Package Discovery** - Scans all `packages/**/.flowstate/config.json` files for `documentation.enabled: true`. Packages are sorted by category, then order, then title.
2. **Documentation Copy** - Copies each package's `.flowstate/docs/` directory into `src/app/docs/{package-slug}/`, renaming `index.md` to `page.md` for Next.js App Router compatibility and converting flat markdown files to directory-based routing.
3. **FlowState Standard Sync** - Copies steering documents (`.flowstate/docs/`, `.flowstate/steering/`, `.flowstate/method/`, `docker/docs/`) into four standard groups: FlowState Method, Process & Methodology, Standards & Reference, and Deployment & Docker. Injects YAML frontmatter, strips duplicate H1 headings, and fixes code blocks for Markdoc/Prism compatibility.
4. **TSDoc Extraction** - For packages with `type: "library"`, uses `ts-morph` to parse TypeScript source files and extract documented interfaces, type aliases, classes, and functions. Generates markdown API reference pages under `api/interfaces/`, `api/types/`, `api/classes/`, and `api/functions/`.
5. **Navigation Manifest Generation** - Produces `src/lib/navigation.generated.json` mapping all packages into navigation groups (FlowState Standard, Infrastructure, Container Apps, Sub Apps, Data & Storage, AI & Agents, MCP, RAG & Knowledge, Auth & Identity, Observability, Shell, Core Utilities, Tools & CLI).
6. **Agent Full-Text Generation** - Concatenates all agent documentation pages from `src/agent/` into `src/agent/llms-full.txt` for the `/llms-full.txt` endpoint.

### Runtime Application

The Next.js application renders documentation using:

- **Markdoc** (`@markdoc/next.js`) for parsing `.md` pages with custom tags and nodes
- **FlexSearch** for client-side full-text search across all pages, built at webpack compile time
- **Prism React Renderer** for syntax-highlighted code blocks via the `Fence` component
- **Algolia Autocomplete Core** for the search dialog UI with keyboard shortcuts (Cmd+K / Ctrl+K)
- **next-themes** for dark/light mode theming
- **ColorThemeContext** for five selectable accent color themes (amber, blue, green, purple, red) persisted to localStorage

### AI Agent Endpoints

The site serves AI agents through dedicated endpoints:

- `/llms.txt` - Index page with links to individual agent documentation sections
- `/llms-full.txt` - Complete agent documentation concatenated into a single file
- `/agent/{slug}` - Individual topic pages (setup, methodology, mcp-tools, entities, spec-workflow, product-driven, examples)

A middleware layer detects AI agent user agents (ChatGPT-User, Claude-Web, GPTBot, ClaudeBot, and others) and redirects them to `/llms.txt` automatically. The `?human=true` query parameter bypasses this redirect.

## Features

- Automated documentation aggregation from 40+ monorepo packages
- TSDoc-to-markdown API reference generation using ts-morph
- Hierarchical navigation with collapsible groups, sections, and page links
- Client-side full-text search powered by FlexSearch with Algolia autocomplete UI
- Dark/light mode with five accent color themes
- Markdoc custom tags: `callout`, `figure`, `quick-links`, `quick-link`, `method-diagram`, `app-suite-diagram`
- AI agent detection middleware with automatic redirect to machine-readable endpoints
- Cloudflare Workers deployment via OpenNext
- Build-time code block normalization for Markdoc/Prism compatibility

## Navigation Structure

Navigation is organized into a three-level hierarchy:

- **Groups** - Top-level categories (e.g., "FlowState Standard", "Sub Apps", "MCP")
- **Sections** - Individual packages within a group (e.g., "Process & Methodology", "Standards & Reference")
- **Links** - Pages within a section (e.g., "Overview", "Getting Started", "Features", "Changelog")

Pages are sorted with a fixed ordering: Overview first, Getting Started second, Features third, Changelog last, everything else by the `order` frontmatter property.

## Quick Links

- [Installation](/docs/documentation/installation)
- [Quick Start](/docs/documentation/quick-start)
- [API Reference](/docs/documentation/api)
- [Examples](/docs/documentation/examples/basic-usage)
- [Changelog](/docs/documentation/changelog)

## Requirements

- Node.js >= 18
- Yarn 4 (monorepo workspace)
- TypeScript >= 5.0

## License

Apache License 2.0
