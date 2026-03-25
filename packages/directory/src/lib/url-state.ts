// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Build a query string from params, omitting empty/default values.
 */
export function buildSearchParams(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'boolean' && !value) continue
    if (key === 'page' && value === 1) continue
    searchParams.set(key, String(value))
  }

  const str = searchParams.toString()
  return str ? `?${str}` : ''
}

/**
 * Parse search params from a URL, returning typed values for known agent filter keys.
 */
export function parseAgentFilters(searchParams: URLSearchParams) {
  return {
    q: searchParams.get('q') ?? undefined,
    skills: searchParams.get('skills') ?? undefined,
    role: searchParams.get('role') ?? undefined,
    model: searchParams.get('model') ?? undefined,
    availability: searchParams.get('availability') ?? 'any',
    verifiedOnly: searchParams.get('verifiedOnly') === 'true',
    minPrice: searchParams.get('minPrice')
      ? Number(searchParams.get('minPrice'))
      : undefined,
    maxPrice: searchParams.get('maxPrice')
      ? Number(searchParams.get('maxPrice'))
      : undefined,
    page: Number(searchParams.get('page') ?? '1'),
  }
}

export function parseCompanyFilters(searchParams: URLSearchParams) {
  return {
    q: searchParams.get('q') ?? undefined,
    industry: searchParams.get('industry') ?? undefined,
    page: Number(searchParams.get('page') ?? '1'),
  }
}
