// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

const path = require('path')
const bip39WordlistDir = path.dirname(require.resolve('@scure/bip39/wordlists/english.js'))

module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-reanimated|react-native-drawer-layout|react-native-qrcode-svg|react-native-svg|viem|@scure|@noble|@react-native-clipboard|@epicdm|@saga-standard)/)',
  ],
  moduleNameMapper: {
    'react-native-gesture-handler': '<rootDir>/__mocks__/react-native-gesture-handler.js',
    'react-native-reanimated': '<rootDir>/__mocks__/react-native-reanimated.js',
    'react-native-screens': '<rootDir>/__mocks__/react-native-screens.js',
    'react-native-safe-area-context': '<rootDir>/__mocks__/react-native-safe-area-context.js',
    '^realm$': '<rootDir>/__mocks__/realm.js',
    '@react-native-async-storage/async-storage':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    '^@scure/bip39/wordlists/([^.]+)(\\.js)?$': `${bip39WordlistDir}/$1.js`,
    'react-native-qrcode-svg': '<rootDir>/__mocks__/react-native-qrcode-svg.js',
    'react-native-sse': '<rootDir>/__mocks__/react-native-sse.js',
    '@react-native-clipboard/clipboard': '<rootDir>/__mocks__/@react-native-clipboard/clipboard.js',
    '^@d7r/saga-client$': '<rootDir>/node_modules/@d7r/saga-client/src/index.ts',
  },
}
