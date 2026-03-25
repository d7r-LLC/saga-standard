---
title: API Reference
order: 4
description: 'Complete reference for sync scripts, components, navigation types, and configuration'
---

## Sync Pipeline Scripts

All scripts live in `packages/documentation/scripts/` and run via `tsx`.

### sync-docs.ts (Orchestrator)

Entry point invoked by `yarn docs:sync`. Executes the full six-step pipeline:

1. `discoverPackages()` - Find packages with documentation enabled
2. `copyDocs()` - Copy package docs to output directory
3. `syncStandard()` - Sync FlowState Standard docs (steering, method, process)
4. `extractPackageApiDocs()` + `generateApiDocs()` - TSDoc extraction for library packages
5. `generateNavigation()` + `writeNavigation()` - Build navigation manifest
6. `generateAgentFullDoc()` - Concatenate agent docs into `llms-full.txt`

### discover.ts

**`discoverPackages(rootDir: string): Promise<DiscoveredPackage[]>`**

Scans `packages/**/.flowstate/config.json` for `documentation.enabled: true`. Excludes `packages/documentation/` itself and `node_modules`. Validates that both `.flowstate/docs/` and `docs/index.md` exist. Returns packages sorted by category, then order, then title.

### copy.ts

**`copyDocs(packages: DiscoveredPackage[], outputDir: string): Promise<void>`**

Copies documentation files from each package's `.flowstate/docs/` into the output directory. Performs:

- Clean existing generated directories (preserving standard doc directories)
- Filter out hidden files (except `.gitkeep`) and `CLAUDE.md` files
- Rename `index.md` to `page.md` for Next.js App Router
- Convert flat `.md` files to `{name}/page.md` directory structure
- Rewrite relative markdown links (`./path` and `../path`) to absolute `/docs/{slug}/path` URLs

### navigation.ts

**`generateNavigation(packages: DiscoveredPackage[], outputDocsDir: string): Promise<NavigationManifest>`**

Builds the navigation manifest from discovered packages. Each package is assigned to a group via the `PACKAGE_TO_GROUP` mapping (60+ explicit package-to-group assignments) with a fallback from the `CATEGORY_TO_DEFAULT_GROUP` mapping.

Groups are displayed in a fixed order:

| Order | Group Key        | Display Title      |
| ----- | ---------------- | ------------------ |
| 1     | `standard`       | FlowState Standard |
| 2     | `infrastructure` | Infrastructure     |
| 3     | `container-apps` | Container Apps     |
| 4     | `sub-apps`       | Sub Apps           |
| 5     | `data-storage`   | Data & Storage     |
| 6     | `ai-agents`      | AI & Agents        |
| 7     | `mcp`            | MCP                |
| 8     | `rag-knowledge`  | RAG & Knowledge    |
| 9     | `auth`           | Auth & Identity    |
| 10    | `observability`  | Observability      |
| 11    | `shell`          | Shell              |
| 12    | `core-utilities` | Core Utilities     |
| 13    | `tools`          | Tools & CLI        |

**`writeNavigation(manifest: NavigationManifest, outputPath: string): Promise<void>`**

Writes the manifest JSON to `src/lib/navigation.generated.json`.

### sync-standard.ts

**`syncStandard(monorepoRoot: string, outputDocsDir: string): Promise<DiscoveredPackage[]>`**

Syncs four groups of FlowState Standard documentation:

- **flowstate-method** - Seven-phase business methodology (`00-INDEX.md` through `09-REFERENCES.md`)
- **flowstate-process** - Development process (FlowState Standard, development process, product-driven development, creating apps)
- **flowstate-standards** - Standards reference (product vision, architecture, code quality, TDD, security, compliance, TSDoc, documentation, nightly automation, mail server, business development, business plan, marketing)
- **flowstate-deployment** - Docker documentation (build patterns, production, security, secrets, testing, troubleshooting)

Each document has its frontmatter injected, H1 stripped (to avoid duplication with `DocsLayout`), and code blocks fixed for Markdoc compatibility (bare ```fences get`text`language,`markdown`fences converted to`text`).

**`getStandardDirNames(): Set<string>`**

Returns the set of directory names managed by standard sync: `flowstate-method`, `flowstate-process`, `flowstate-standards`, `flowstate-deployment`.

### tsdoc-parser.ts

**`extractPackageApiDocs(packagePath: string, packageSlug: string): Promise<PackageApiDocs>`**

Uses `ts-morph` to parse all `.ts` and `.tsx` files in a package's `src/` directory. Extracts:

- **Interfaces** - Name, description, properties (with types, optionality, descriptions), examples
- **Type aliases** - Name, description, resolved type text
- **Classes** - Name, description, constructor, public methods, public properties, examples
- **Functions** - Name, description, parameters, return type, examples, full signature

Skips test files (`__tests__`, `.test.`, `.spec.`), declaration files (`.d.ts`), and private class members. Uses the package's `tsconfig.json` when available, falling back to default compiler options.

### generate-api-docs.ts

**`generateApiDocs(apiDocs: PackageApiDocs, outputDir: string): Promise<string[]>`**

Converts extracted TSDoc into markdown files following Next.js App Router convention:

| Output Path              | Content                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `api/interfaces/page.md` | All exported interfaces with property tables                    |
| `api/types/page.md`      | All exported type aliases with type definitions                 |
| `api/classes/page.md`    | All exported classes with constructors, methods, and properties |
| `api/functions/page.md`  | All exported functions with signatures, parameters, and returns |

Only files with content are generated. Returns an array of generated file paths.

### generate-agent-full.ts

**`generateAgentFullDoc(docsPackageDir: string): Promise<void>`**

Reads agent documentation pages from `src/agent/` in the order defined by `AGENT_PAGE_SLUGS` (setup, methodology, mcp-tools, entities, spec-workflow, product-driven, examples) and concatenates them into `src/agent/llms-full.txt`.

## Types (scripts/types.ts)

### DocumentationConfig

```typescript
interface DocumentationConfig {
  enabled: boolean
  type: 'app' | 'library'
  title: string
  description?: string
  category: string
  order?: number
}
```

### DiscoveredPackage

```typescript
interface DiscoveredPackage {
  slug: string // Package directory name
  packagePath: string // Absolute path to package root
  docsPath: string // Absolute path to .flowstate/docs/
  config: DocumentationConfig
}
```

### NavigationManifest

```typescript
interface NavigationManifest {
  generatedAt: string
  groups: NavigationGroup[]
}

interface NavigationGroup {
  name: string
  title: string
  packages: NavigationPackage[]
}

interface NavigationPackage {
  slug: string
  title: string
  description?: string
  order: number
  pages: NavigationPage[]
}

interface NavigationPage {
  slug: string
  title: string
  order: number
  href: string
}
```

### PackageApiDocs

```typescript
interface PackageApiDocs {
  packageSlug: string
  interfaces: TSDocInterface[]
  types: TSDocTypeAlias[]
  classes: TSDocClass[]
  functions: TSDocFunction[]
}
```

## Runtime Navigation Types (src/lib/navigation-types.ts)

The runtime navigation consumed by React components uses a simplified three-level structure:

```typescript
type Navigation = NavigationGroup[]

interface NavigationGroup {
  title: string
  sections: NavigationSection[]
}

interface NavigationSection {
  title: string
  links: NavigationLink[]
}

interface NavigationLink {
  title: string
  href: string
}
```

The `transformManifest()` function in `src/lib/navigation.ts` converts the generated `NavigationManifest` into this runtime `Navigation` type.

## Markdoc Configuration

### Custom Tags (src/markdoc/tags.js)

| Tag                 | Attributes                                                             | Component         |
| ------------------- | ---------------------------------------------------------------------- | ----------------- |
| `callout`           | `title: String`, `type: "note" \| "warning"`                           | `Callout`         |
| `figure`            | `src: String`, `alt: String`, `caption: String`                        | Inline `<figure>` |
| `quick-links`       | (none)                                                                 | `QuickLinks`      |
| `quick-link`        | `title: String`, `description: String`, `icon: String`, `href: String` | `QuickLink`       |
| `method-diagram`    | (none)                                                                 | `MethodDiagram`   |
| `app-suite-diagram` | (none)                                                                 | `AppSuiteDiagram` |

### Custom Nodes (src/markdoc/nodes.js)

| Node       | Behavior                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `document` | Wraps content in `DocsLayout`, parses YAML frontmatter with `js-yaml`, passes nodes for table of contents generation    |
| `heading`  | Auto-generates slugified `id` attributes using `@sindresorhus/slugify` with a per-document counter to ensure uniqueness |
| `th`       | Adds default `scope="col"` attribute to table headers                                                                   |
| `fence`    | Renders code blocks through the `Fence` component using `prism-react-renderer` for syntax highlighting                  |

### Search Index (src/markdoc/search.mjs)

A webpack loader that builds a FlexSearch document index at compile time. It:

1. Globs all `**/page.md` files under `src/app/`
2. Parses each with Markdoc to extract heading sections and paragraph content
3. Generates an inline FlexSearch index module with `search(query, options)` export
4. Uses content caching to avoid re-parsing unchanged files during rebuilds

The FlexSearch configuration uses full tokenization with bidirectional context matching (depth: 2, resolution: 9).

## API Route Handlers

### GET /llms.txt

Serves `src/agent/llms.txt` as `text/markdown` with 1-hour public cache.

### GET /llms-full.txt

Serves `src/agent/llms-full.txt` (generated by `docs:sync`) as `text/markdown` with 1-hour public cache.

### GET /agent/{slug}

Serves individual agent documentation pages from `src/agent/{slug}.md`. Validates the slug against `AGENT_PAGE_SLUGS` (setup, methodology, mcp-tools, entities, spec-workflow, product-driven, examples). Returns 404 for invalid slugs.

## Middleware (src/middleware.ts)

Runs on `/` and `/docs/:path*` routes. Detects AI agent user agents and redirects them to `/llms.txt` with a 302 redirect. Recognized agents: ChatGPT-User, Claude-Web, GPTBot, Google-Extended, anthropic-ai, Perplexity, cohere-ai, CCBot, Bytespider, ClaudeBot. The `?human=true` query parameter bypasses the redirect.

## Key Components

| Component         | File                                 | Purpose                                                         |
| ----------------- | ------------------------------------ | --------------------------------------------------------------- |
| `Layout`          | `src/components/Layout.tsx`          | Root layout with header, sidebar navigation, Hero on homepage   |
| `DocsLayout`      | `src/components/DocsLayout.tsx`      | Documentation page wrapper with table of contents               |
| `Navigation`      | `src/components/Navigation.tsx`      | Collapsible sidebar navigation with auto-expand for active page |
| `Search`          | `src/components/Search.tsx`          | Search dialog with Algolia autocomplete, Cmd+K shortcut         |
| `Fence`           | `src/components/Fence.tsx`           | Syntax-highlighted code blocks via prism-react-renderer         |
| `Callout`         | `src/components/Callout.tsx`         | Note and warning callout blocks                                 |
| `Hero`            | `src/components/Hero.tsx`            | Homepage hero section                                           |
| `ThemeSelector`   | `src/components/ThemeSelector.tsx`   | Dark/light mode toggle                                          |
| `EpicLogo`        | `src/components/EpicLogo.tsx`        | Logo with color theme support                                   |
| `TableOfContents` | `src/components/TableOfContents.tsx` | Right sidebar table of contents from H2/H3 headings             |
| `PrevNextLinks`   | `src/components/PrevNextLinks.tsx`   | Previous/next page navigation at bottom of docs                 |
| `MethodDiagram`   | `src/components/MethodDiagram.tsx`   | Interactive FlowState Method phase diagram                      |
| `AppSuiteDiagram` | `src/components/AppSuiteDiagram.tsx` | Interactive App Suite overview diagram                          |
