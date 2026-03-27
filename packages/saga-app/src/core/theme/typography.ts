// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Platform, TextStyle } from 'react-native'

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
})

export const typography = {
  h1: {
    fontFamily,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  } as TextStyle,
  h2: {
    fontFamily,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  } as TextStyle,
  h3: {
    fontFamily,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  } as TextStyle,
  bodySmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  } as TextStyle,
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,
} as const

export type TypographyKey = keyof typeof typography
