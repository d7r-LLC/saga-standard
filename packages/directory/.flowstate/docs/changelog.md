---
title: Changelog
order: 99
description: 'Release history for the Epic FlowState documentation site'
---

All notable changes to the `@epicdm/flowstate-docs` package are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-02-27

### Added

- FlowState Method documentation group with seven-phase business methodology (market positioning, offer architecture, content & messaging, audience & reach, revenue & monetization, operations & scale, support & customer success), feature status matrix, and references
- Method diagram and App Suite diagram interactive components
- FlowState Standard sync for steering documents (PRODUCT, TECHNICAL, STRUCTURE, QUALITY, TDD, SECURITY, COMPLIANCE, TSDOC, DOCUMENTATION, COMPOUND, MAIL_SERVER, BIZDEV, BIZPLAN, MARKETING)
- Deployment & Docker documentation group (build patterns, production, security, secrets, testing, troubleshooting)
- Color theme system with five selectable accent themes (amber, blue, green, purple, red) persisted to localStorage via `ColorThemeContext`
- `QuickLinks` and `QuickLink` Markdoc custom tags for feature navigation on overview pages
- `MethodDiagram` and `AppSuiteDiagram` Markdoc custom tags for interactive diagrams

### Fixed

- Build artifacts and secrets removed from git tracking
- Lint errors resolved across documentation site components

## [0.1.0-beta.3] - 2026-02-23

### Added

- AI agent-optimized documentation with `/llms.txt` convention
- `/llms.txt` route serving agent documentation index
- `/llms-full.txt` route serving concatenated full agent documentation
- `/agent/{slug}` dynamic routes for individual agent topics (setup, methodology, mcp-tools, entities, spec-workflow, product-driven, examples)
- `AGENT_PAGE_SLUGS` shared constant for slug validation between route handler and build script
- `generateAgentFullDoc()` build step concatenating agent pages into `llms-full.txt`
- Middleware detecting AI agent user agents (ChatGPT-User, Claude-Web, GPTBot, Google-Extended, anthropic-ai, Perplexity, cohere-ai, CCBot, Bytespider, ClaudeBot) and redirecting to `/llms.txt`
- `?human=true` query parameter to bypass AI agent redirect
- SPDX Apache-2.0 license headers on all source files

## [0.1.0-beta.2] - 2026-02-10

### Changed

- Navigation grouped by domain category (FlowState Standard, Infrastructure, Container Apps, Sub Apps, Data & Storage, AI & Agents, MCP, RAG & Knowledge, Auth & Identity, Observability, Shell, Core Utilities, Tools & CLI)
- `PACKAGE_TO_GROUP` explicit mapping for 60+ packages with `CATEGORY_TO_DEFAULT_GROUP` fallback
- FlowState Standard documentation synced from `.flowstate/docs/`, `.flowstate/steering/`, and `docker/docs/`
- Code block normalization for Markdoc/Prism compatibility (bare fences get `text` language, `markdown` fences converted to `text`)
- H1 stripping from synced standard documents to prevent duplication with `DocsLayout` title

## [0.1.0-beta.1] - 2026-01-23

### Added

- Collapsible accordion navigation with three levels: groups, sections (packages), and page links
- Navigation sorted with fixed ordering: Overview first, Getting Started second, Features third, Changelog last
- Per-package accordion sections with auto-expand for the active page

### Fixed

- Per-package accordion navigation structure restored after grouping refactor

## [0.1.0-alpha] - 2026-01-22

### Added

- Documentation sync pipeline (`docs:sync` script) with six-step orchestration
- Package discovery module scanning `packages/**/.flowstate/config.json` for `documentation.enabled`
- Documentation copy module with `index.md` to `page.md` renaming, flat-to-directory conversion, and relative link rewriting
- Navigation manifest generation from discovered packages, written to `src/lib/navigation.generated.json`
- TSDoc parser module using `ts-morph` to extract interfaces, type aliases, classes, and functions from library packages
- API documentation markdown generator producing `api/interfaces/`, `api/types/`, `api/classes/`, `api/functions/` pages
- Type definitions for sync pipeline (`DocumentationConfig`, `DiscoveredPackage`, `NavigationManifest`, `PackageApiDocs`, etc.)
- Navigation type system (`NavigationGroup`, `NavigationSection`, `NavigationLink`, `GeneratedNavigationManifest`)
- Runtime navigation loading from generated JSON manifest with default fallback

## [0.0.1] - 2025-11-02

### Added

- Initial package scaffold as `@epicdm/flowstate-docs`
- Next.js 15 application with App Router
- Markdoc integration via `@markdoc/next.js` with custom tags (`callout`, `figure`) and nodes (`document`, `heading`, `th`, `fence`)
- FlexSearch full-text search built at webpack compile time from all `page.md` files
- Algolia Autocomplete search dialog with Cmd+K / Ctrl+K keyboard shortcut
- `prism-react-renderer` syntax highlighting for code blocks
- Dark/light mode theming via `next-themes`
- Tailwind CSS with `@tailwindcss/typography` for prose styling
- Cloudflare Workers deployment via `@opennextjs/cloudflare`
- Responsive layout with sticky header, sidebar navigation, and table of contents
- Inter and Lexend (local) font configuration
- Homepage with Hero section and quick links
