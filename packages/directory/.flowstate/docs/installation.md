---
title: Installation
order: 2
description: 'Setting up the documentation site for local development and deployment'
---

The documentation package (`@epicdm/flowstate-docs`) is a private workspace package. It is not published to npm. All operations run through Yarn workspace commands from the monorepo root.

## Prerequisites

- Node.js >= 18
- Yarn 4 (configured at the monorepo root)
- Monorepo dependencies installed (`yarn install` from root)

## Install Dependencies

From the monorepo root:

```bash
yarn install
```

This installs all workspace dependencies, including the documentation package's dependencies.

## Key Dependencies

### Runtime

| Package                                | Purpose                                  |
| -------------------------------------- | ---------------------------------------- |
| `next` (^15)                           | Application framework with App Router    |
| `@markdoc/markdoc` (^0.5.2)            | Markdown parsing engine                  |
| `@markdoc/next.js` (^0.5.0)            | Next.js integration for Markdoc          |
| `@algolia/autocomplete-core` (^1.19.2) | Search autocomplete UI engine            |
| `flexsearch` (^0.8.205)                | Client-side full-text search indexing    |
| `prism-react-renderer` (^2.4.1)        | Syntax highlighting for code blocks      |
| `@headlessui/react` (^2.2.6)           | Accessible UI primitives (search dialog) |
| `next-themes` (^0.4.6)                 | Dark/light mode theming                  |
| `gray-matter` (^4.0.3)                 | YAML frontmatter parsing                 |
| `fast-glob` (^3.3.3)                   | File pattern matching                    |
| `fs-extra` (^11.3.3)                   | Enhanced filesystem operations           |
| `@sindresorhus/slugify` (^2.2.1)       | URL slug generation for headings         |
| `tailwindcss` (^4.1.11)                | Utility-first CSS framework              |
| `@tailwindcss/typography` (^0.5.16)    | Prose typography styling                 |
| `clsx` (^2.1.1)                        | Conditional CSS class merging            |

### Dev / Build

| Package                           | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `tsx` (^4.21.0)                   | TypeScript execution for sync scripts       |
| `ts-morph` (^27.0.2)              | TypeScript AST parsing for TSDoc extraction |
| `@opennextjs/cloudflare` (^1.6.3) | Cloudflare Workers deployment adapter       |
| `sharp` (0.34.3)                  | Image processing (used by Next.js)          |

## Configuration

### Next.js Configuration

The `next.config.mjs` chains two wrappers around the base Next.js config:

```javascript
import withMarkdoc from '@markdoc/next.js'
import withSearch from './src/markdoc/search.mjs'

const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'ts', 'tsx'],
  images: {
    unoptimized: true,
  },
}

export default withSearch(
  withMarkdoc({ schemaPath: './src/markdoc' })(nextConfig),
)
```

- `withMarkdoc` enables `.md` files as page sources, loading custom tags and nodes from `src/markdoc/`
- `withSearch` injects a webpack loader that builds a FlexSearch index from all `page.md` files at compile time
- `pageExtensions` includes `md` so Markdoc pages work alongside TypeScript pages
- Image optimization is disabled (`unoptimized: true`) to avoid sharp dependency issues in the monorepo

### TypeScript Configuration

The `tsconfig.json` uses strict mode with the Next.js plugin and path aliases:

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

The `@/*` path alias maps to `./src/*`, so imports like `@/components/Layout` resolve to `src/components/Layout`.

### Cloudflare Deployment

The `open-next.config.ts` uses the default Cloudflare configuration:

```typescript
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
export default defineCloudflareConfig()
```

## Enabling Documentation for a Package

To have a monorepo package included in the documentation site, add a `documentation` section to its `.flowstate/config.json`:

```json
{
  "documentation": {
    "enabled": true,
    "type": "app",
    "title": "Package Title",
    "description": "Brief description",
    "category": "apps",
    "order": 1
  }
}
```

| Field         | Type                 | Description                                               |
| ------------- | -------------------- | --------------------------------------------------------- |
| `enabled`     | `boolean`            | Must be `true` for the package to be discovered           |
| `type`        | `"app" \| "library"` | `"library"` enables TSDoc extraction; `"app"` does not    |
| `title`       | `string`             | Display name in navigation                                |
| `description` | `string`             | Optional description                                      |
| `category`    | `string`             | Navigation grouping (e.g., `"apps"`, `"core"`, `"tools"`) |
| `order`       | `number`             | Sort order within its category                            |

Then create the documentation files at `.flowstate/docs/index.md` (required) with YAML frontmatter.

## Next Steps

- [Quick Start](/docs/documentation/quick-start) - Run the dev server and sync pipeline
- [API Reference](/docs/documentation/api) - Scripts, components, and configuration reference
