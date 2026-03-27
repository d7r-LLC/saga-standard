// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { ChainProvider, useChain } from '../../../src/core/providers/ChainProvider'
import type { ChainId } from '../../../src/features/wallet/types'

jest.mock('viem', () => ({
  createPublicClient: jest.fn().mockReturnValue({ chain: { id: 84532 } }),
  http: jest.fn().mockReturnValue({}),
}))

function TestConsumer() {
  const { chainId, publicClient } = useChain()
  return (
    <>
      <Text testID="chainId">{chainId}</Text>
      <Text testID="hasClient">{String(!!publicClient)}</Text>
    </>
  )
}

describe('ChainProvider', () => {
  it('provides default chain and public client', () => {
    const { getByTestId } = render(
      <ChainProvider>
        <TestConsumer />
      </ChainProvider>
    )

    expect(getByTestId('chainId').props.children).toBe('base-sepolia')
    expect(getByTestId('hasClient').props.children).toBe('true')
  })

  it('allows switching chain', () => {
    let switchFn: ((chain: ChainId) => void) | null = null
    function SwitchConsumer() {
      const { chainId, setChainId } = useChain()
      switchFn = setChainId
      return <Text testID="chainId">{chainId}</Text>
    }

    const { getByTestId } = render(
      <ChainProvider>
        <SwitchConsumer />
      </ChainProvider>
    )

    expect(getByTestId('chainId').props.children).toBe('base-sepolia')

    act(() => {
      switchFn?.('base' as ChainId)
    })

    expect(getByTestId('chainId').props.children).toBe('base')
  })
})
