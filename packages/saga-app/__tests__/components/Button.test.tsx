// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { Button } from '../../src/components/Button'

describe('Button', () => {
  it('renders title text', () => {
    const { getByText } = render(<Button title="Press me" onPress={() => {}} />)
    expect(getByText('Press me')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    const { getByRole } = render(<Button title="Press me" onPress={onPress} />)
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    const { getByRole } = render(<Button title="Press me" onPress={onPress} disabled />)
    fireEvent.press(getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('shows loading indicator when loading', () => {
    const { queryByText } = render(<Button title="Press me" onPress={() => {}} loading />)
    expect(queryByText('Press me')).toBeNull()
  })
})
