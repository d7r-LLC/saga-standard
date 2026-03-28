// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

class MockEventSource {
  constructor(url, config) {
    this.url = url
    this.config = config
    this._listeners = {}
    MockEventSource._instances.push(this)
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = []
    }
    this._listeners[event].push(handler)
  }

  removeAllEventListeners() {
    this._listeners = {}
  }

  close() {
    this._closed = true
  }

  // Test helper: emit an event to all registered listeners
  __emit(event, data) {
    const handlers = this._listeners[event] || []
    handlers.forEach(handler => handler(data))
  }
}

MockEventSource._instances = []
MockEventSource._reset = () => {
  MockEventSource._instances = []
}

module.exports = MockEventSource
module.exports.default = MockEventSource
