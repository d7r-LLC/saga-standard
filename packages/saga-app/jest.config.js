// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-reanimated|react-native-drawer-layout)/)',
  ],
  moduleNameMapper: {
    'react-native-gesture-handler': '<rootDir>/__mocks__/react-native-gesture-handler.js',
    'react-native-reanimated': '<rootDir>/__mocks__/react-native-reanimated.js',
    'react-native-screens': '<rootDir>/__mocks__/react-native-screens.js',
    'react-native-safe-area-context': '<rootDir>/__mocks__/react-native-safe-area-context.js',
    '^realm$': '<rootDir>/__mocks__/realm.js',
    '@react-native-async-storage/async-storage':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
  },
}
