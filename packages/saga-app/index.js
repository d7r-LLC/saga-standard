// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { AppRegistry } from 'react-native'
import App from './src/App'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)
