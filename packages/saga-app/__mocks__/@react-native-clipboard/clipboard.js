// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/* global jest */

module.exports = {
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue(''),
}
