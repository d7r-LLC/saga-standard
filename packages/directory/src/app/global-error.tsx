// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

/**
 * Top-level error boundary for the App Router. Renders a complete
 * <html>/<body> tree because it REPLACES the root layout when an
 * unhandled error bubbles out of any nested route segment.
 *
 * Required for Next 15 because the root layout is async (it awaits
 * getSession() to read the auth cookie), and Next's automatic
 * prerendering of the fallback `/500` static page tries to render
 * the root layout at build time outside of a request context — the
 * await throws, the prerender fails with a `useRef`-on-null error
 * deep inside React's hydration path, and the build aborts.
 *
 * Providing global-error.tsx tells Next "use THIS for the prerender
 * fallback instead of synthesizing one from the layout." It runs
 * client-side only (note the 'use client' directive), so no server-
 * side hooks fire during prerender.
 *
 * Per Next docs (https://nextjs.org/docs/app/api-reference/file-conventions/error)
 * global-error.tsx is the ONLY way to customize the top-level error
 * UI in App Router; route-level error.tsx files cannot intercept
 * errors that fire above the layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#64748b',
              marginBottom: '1.5rem',
              maxWidth: '32rem',
            }}
          >
            An unexpected error occurred. The team has been notified.
          </p>
          {error.digest && (
            <code
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                marginBottom: '1.5rem',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              }}
            >
              digest: {error.digest}
            </code>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              backgroundColor: '#0f172a',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
