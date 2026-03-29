// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ChatInput } from '../../../../src/features/chat/components/ChatInput'

describe('ChatInput', () => {
  it('renders text input and send button', () => {
    const onSend = jest.fn()
    const { getByLabelText } = render(<ChatInput onSend={onSend} />)

    expect(getByLabelText('Message input')).toBeTruthy()
    expect(getByLabelText('Send message')).toBeTruthy()
  })

  it('calls onSend with trimmed text and clears input after send', () => {
    const onSend = jest.fn()
    const { getByLabelText } = render(<ChatInput onSend={onSend} />)

    const input = getByLabelText('Message input')
    fireEvent.changeText(input, '  Hello world  ')

    const sendButton = getByLabelText('Send message')
    fireEvent.press(sendButton)

    expect(onSend).toHaveBeenCalledWith('Hello world')
    expect(input.props.value).toBe('')
  })

  it('does not call onSend when input is empty', () => {
    const onSend = jest.fn()
    const { getByLabelText } = render(<ChatInput onSend={onSend} />)

    const sendButton = getByLabelText('Send message')
    fireEvent.press(sendButton)

    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not call onSend when disabled prop is true', () => {
    const onSend = jest.fn()
    const { getByLabelText } = render(<ChatInput onSend={onSend} disabled />)

    const input = getByLabelText('Message input')
    fireEvent.changeText(input, 'Should not send')

    const sendButton = getByLabelText('Send message')
    fireEvent.press(sendButton)

    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows stop button when streaming is true', () => {
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={jest.fn()} streaming />
    )

    expect(getByLabelText('Stop generation')).toBeTruthy()
  })

  it('calls onStop when stop button is pressed', () => {
    const onStop = jest.fn()
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={onStop} streaming />
    )

    fireEvent.press(getByLabelText('Stop generation'))

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('disables text input when streaming', () => {
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={jest.fn()} streaming />
    )

    const input = getByLabelText('Message input')
    expect(input.props.editable).toBe(false)
  })

  it('shows send button when not streaming', () => {
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={jest.fn()} />
    )

    expect(getByLabelText('Send message')).toBeTruthy()
  })
})
