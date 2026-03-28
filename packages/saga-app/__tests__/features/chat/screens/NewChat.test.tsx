// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { NewChat } from '../../../../src/features/chat/screens/NewChat'
import type { Conversation } from '../../../../src/features/chat/types'

const mockCreate = jest.fn()
const mockGoBack = jest.fn()
const mockReplace = jest.fn()

jest.mock('../../../../src/features/chat/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
    create: mockCreate,
    remove: jest.fn(),
  }),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    identities: [
      {
        id: 'id-1',
        type: 'agent',
        handle: 'alice.saga',
        tokenId: '1',
        contractAddress: '0xtest',
        tbaAddress: '0xtba',
        hubUrl: 'https://hub.test',
      },
    ],
    activeIdentityId: 'id-1',
    initialized: true,
    wallets: [],
    activeWalletId: null,
    setActiveIdentityId: jest.fn(),
    setActiveWalletId: jest.fn(),
    addWallet: jest.fn(),
    removeWallet: jest.fn(),
    updateWallet: jest.fn(),
    addIdentity: jest.fn(),
    removeIdentity: jest.fn(),
    updateIdentity: jest.fn(),
  }),
}))

const MOCK_CONVERSATION: Conversation = {
  id: 'conv-new-123',
  agentHandle: 'alice.saga',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250514',
  title: null,
  systemPrompt: null,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createNavigation(): any {
  return {
    navigation: {
      goBack: mockGoBack,
      replace: mockReplace,
      navigate: jest.fn(),
      dispatch: jest.fn(),
      reset: jest.fn(),
      setOptions: jest.fn(),
      setParams: jest.fn(),
      isFocused: jest.fn().mockReturnValue(true),
      canGoBack: jest.fn().mockReturnValue(true),
      getId: jest.fn(),
      getParent: jest.fn(),
      getState: jest.fn(),
      addListener: jest.fn().mockReturnValue(jest.fn()),
      removeListener: jest.fn(),
    },
    route: {
      key: 'NewChat-test',
      name: 'NewChat' as const,
      params: undefined,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreate.mockResolvedValue(MOCK_CONVERSATION)
})

describe('NewChat', () => {
  it('renders all provider/model options', () => {
    const props = createNavigation()
    const { getByText } = render(<NewChat {...props} />)

    expect(getByText('Claude Sonnet')).toBeTruthy()
    expect(getByText('claude-sonnet-4-5-20250514')).toBeTruthy()
    expect(getByText('GPT-4o')).toBeTruthy()
    expect(getByText('gpt-4o')).toBeTruthy()
    expect(getByText('Gemini Flash')).toBeTruthy()
    expect(getByText('gemini-2.0-flash')).toBeTruthy()
  })

  it('renders the header with Back action', () => {
    const props = createNavigation()
    const { getByText } = render(<NewChat {...props} />)

    expect(getByText('New Chat')).toBeTruthy()
    expect(getByText('Back')).toBeTruthy()

    fireEvent.press(getByText('Back'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('shows system prompt input', () => {
    const props = createNavigation()
    const { getByLabelText } = render(<NewChat {...props} />)

    const input = getByLabelText('System prompt')
    expect(input).toBeTruthy()
  })

  it('Start Conversation button is disabled until a model is selected', () => {
    const props = createNavigation()
    const { getByRole } = render(<NewChat {...props} />)

    const button = getByRole('button', { name: 'Start Conversation' })
    expect(button.props.accessibilityState?.disabled).toBe(true)
  })

  it('selecting a provider/model enables the Start Conversation button', () => {
    const props = createNavigation()
    const { getByText, getByRole } = render(<NewChat {...props} />)

    fireEvent.press(getByText('Claude Sonnet'))

    const button = getByRole('button', { name: 'Start Conversation' })
    expect(button.props.accessibilityState?.disabled).toBe(false)
  })

  it('calls create() with correct params and navigates on success', async () => {
    const props = createNavigation()
    const { getByText, getByRole, getByLabelText } = render(<NewChat {...props} />)

    // Select a provider
    fireEvent.press(getByText('GPT-4o'))

    // Enter a system prompt
    const input = getByLabelText('System prompt')
    fireEvent.changeText(input, 'You are a helpful assistant')

    // Press create
    const button = getByRole('button', { name: 'Start Conversation' })
    fireEvent.press(button)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        agentHandle: 'alice.saga',
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'You are a helpful assistant',
      })
    })

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('ChatScreen', {
        conversationId: 'conv-new-123',
        title: undefined,
      })
    })
  })

  it('does not include systemPrompt when input is empty', async () => {
    const props = createNavigation()
    const { getByText, getByRole } = render(<NewChat {...props} />)

    fireEvent.press(getByText('Claude Sonnet'))

    const button = getByRole('button', { name: 'Start Conversation' })
    fireEvent.press(button)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
        systemPrompt: undefined,
      })
    })
  })

  it('shows an alert on create failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Server unavailable'))
    const alertSpy = jest.spyOn(Alert, 'alert')

    const props = createNavigation()
    const { getByText, getByRole } = render(<NewChat {...props} />)

    fireEvent.press(getByText('Gemini Flash'))

    const button = getByRole('button', { name: 'Start Conversation' })
    fireEvent.press(button)

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Failed to create conversation',
        'Server unavailable'
      )
    })

    expect(mockReplace).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('trims whitespace-only system prompt to undefined', async () => {
    const props = createNavigation()
    const { getByText, getByRole, getByLabelText } = render(<NewChat {...props} />)

    fireEvent.press(getByText('Claude Sonnet'))

    const input = getByLabelText('System prompt')
    fireEvent.changeText(input, '   ')

    const button = getByRole('button', { name: 'Start Conversation' })
    fireEvent.press(button)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: undefined })
      )
    })
  })
})
