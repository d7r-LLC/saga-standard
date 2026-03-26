// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://directory.saga-standard.dev/sitemap.xml',
  }
}
