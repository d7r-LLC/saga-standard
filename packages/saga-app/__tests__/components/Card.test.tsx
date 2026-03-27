// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'
import { Card } from '../../src/components/Card'

describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(
      <Card>
        <Text>Card content</Text>
      </Card>
    )
    expect(getByText('Card content')).toBeTruthy()
  })

  it('is pressable when onPress provided', () => {
    const onPress = jest.fn()
    const { getByText } = render(
      <Card onPress={onPress}>
        <Text>Pressable card</Text>
      </Card>
    )
    fireEvent.press(getByText('Pressable card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
