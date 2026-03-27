// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

export type SpacingKey = keyof typeof spacing
