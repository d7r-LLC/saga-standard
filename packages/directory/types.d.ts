// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type SearchOptions } from 'flexsearch'

declare module '@/markdoc/search.mjs' {
  export type Result = {
    url: string
    title: string
    pageTitle?: string
  }

  export function search(query: string, options?: SearchOptions): Array<Result>
}
