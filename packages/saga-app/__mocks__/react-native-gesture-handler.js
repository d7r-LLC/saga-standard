// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Mock for react-native-gesture-handler in Jest environment
// The native module is not available in the test environment

const React = require('react')
const { View } = require('react-native')

const GestureHandlerRootView = ({ children, style }) =>
  React.createElement(View, { style }, children)

module.exports = {
  GestureHandlerRootView,
  // Add other exports as needed
  Gesture: {
    Tap: () => ({ onEnd: () => ({}) }),
    Pan: () => ({ onUpdate: () => ({}) }),
  },
  GestureDetector: ({ children }) => children,
}
