// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

await initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      }
    }
    return config
  },
}

export default nextConfig
