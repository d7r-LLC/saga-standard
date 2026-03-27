// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export const colors = {
  // Backgrounds
  background: '#0a0a0f',
  surface: '#141420',
  surfaceElevated: '#1c1c2e',
  surfacePressed: '#24243a',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#a0a0b8',
  textTertiary: '#6c6c84',
  textInverse: '#0a0a0f',

  // Brand
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Borders
  border: '#2a2a40',
  borderFocused: '#6366f1',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',

  // Entity badges
  agent: '#6366f1',
  org: '#8b5cf6',
  directory: '#06b6d4',
} as const

export type ColorKey = keyof typeof colors
