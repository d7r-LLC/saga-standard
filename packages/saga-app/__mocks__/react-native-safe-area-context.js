// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Mock for react-native-safe-area-context in Jest environment
const React = require('react')
const { View } = require('react-native')

const SafeAreaProvider = ({ children }) => React.createElement(View, null, children)
const SafeAreaView = ({ children }) => React.createElement(View, null, children)
const SafeAreaConsumer = ({ children }) => children({ top: 0, right: 0, bottom: 0, left: 0 })

module.exports = {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaConsumer,
  SafeAreaInsetsContext: React.createContext({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
}
