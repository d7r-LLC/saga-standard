// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC
/* eslint-env jest */

// Mock for react-native-screens in Jest environment
const { View } = require('react-native')

module.exports = {
  enableScreens: jest.fn(),
  screensEnabled: jest.fn(() => true),
  Screen: View,
  ScreenContainer: View,
  NativeScreen: View,
  NativeScreenContainer: View,
  ScreenStack: View,
  ScreenStackHeaderConfig: View,
}
