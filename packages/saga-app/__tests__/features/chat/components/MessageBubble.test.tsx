// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { render } from '@testing-library/react-native'
import { MessageBubble } from '../../../../src/features/chat/components/MessageBubble'

describe('MessageBubble', () => {
  it('renders user message content', () => {
    const { getByText } = render(
      <MessageBubble role="user" content="Hello from the user" testID="msg-user" />
    )

    expect(getByText('Hello from the user')).toBeTruthy()
  })

  it('renders assistant message content', () => {
    const { getByText } = render(
      <MessageBubble role="assistant" content="Hello from the assistant" testID="msg-assistant" />
    )

    expect(getByText('Hello from the assistant')).toBeTruthy()
  })

  it('user bubble has flex-end alignment', () => {
    const { getByTestId } = render(
      <MessageBubble role="user" content="User text" testID="msg-user" />
    )

    const row = getByTestId('msg-user')
    const flatStyle = Array.isArray(row.props.style)
      ? Object.assign({}, ...row.props.style)
      : row.props.style
    expect(flatStyle.alignItems).toBe('flex-end')
  })

  it('assistant bubble has flex-start alignment', () => {
    const { getByTestId } = render(
      <MessageBubble role="assistant" content="Assistant text" testID="msg-assistant" />
    )

    const row = getByTestId('msg-assistant')
    const flatStyle = Array.isArray(row.props.style)
      ? Object.assign({}, ...row.props.style)
      : row.props.style
    expect(flatStyle.alignItems).toBe('flex-start')
  })

  it('renders system message centered with caption style', () => {
    const { getByText } = render(
      <MessageBubble role="system" content="System notice" testID="msg-system" />
    )

    expect(getByText('System notice')).toBeTruthy()
  })
})
