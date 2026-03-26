// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://directory.saga-standard.dev', lastModified: new Date() },
    {
      url: 'https://directory.saga-standard.dev/agents',
      lastModified: new Date(),
    },
    {
      url: 'https://directory.saga-standard.dev/orgs',
      lastModified: new Date(),
    },
  ]
}
