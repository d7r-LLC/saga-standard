// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { render } from '@testing-library/react-native'

// Mock the navigation entirely — native navigators don't work in Jest
jest.mock('../src/navigation', () => ({
  RootNavigator: () => null,
}))

// Mock the providers
jest.mock('../src/core/providers/StorageProvider', () => ({
  StorageProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../src/core/providers/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import App from '../src/App'

test('renders without crashing', () => {
  const { toJSON } = render(<App />)
  expect(toJSON()).toBeTruthy()
})
