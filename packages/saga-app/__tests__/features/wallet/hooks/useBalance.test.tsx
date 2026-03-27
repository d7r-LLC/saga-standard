// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { useBalance } from '../../../../src/features/wallet/hooks/useBalance'

jest.mock('../../../../src/features/wallet/chain', () => ({
  fetchAllBalances: jest.fn().mockResolvedValue([
    { symbol: 'ETH', name: 'Ethereum', balance: '1.5', decimals: 18 },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '100.0',
      decimals: 6,
      contractAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
  ]),
}))

function TestConsumer({ address }: { address: `0x${string}` | null }) {
  const { balances, loading, error } = useBalance(address, 'base-sepolia')
  return (
    <>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="error">{error ?? 'none'}</Text>
      <Text testID="balanceCount">{balances.length}</Text>
      {balances.map(b => (
        <Text key={b.symbol} testID={`balance-${b.symbol}`}>
          {b.balance}
        </Text>
      ))}
    </>
  )
}

describe('useBalance', () => {
  it('fetches balances for an address', async () => {
    const { getByTestId } = render(
      <TestConsumer address="0x1234567890abcdef1234567890abcdef12345678" />
    )

    await act(async () => {})

    expect(getByTestId('balanceCount').props.children).toBe(2)
    expect(getByTestId('balance-ETH').props.children).toBe('1.5')
    expect(getByTestId('balance-USDC').props.children).toBe('100.0')
  })

  it('does not fetch when address is null', async () => {
    const { getByTestId } = render(<TestConsumer address={null} />)
    await act(async () => {})
    expect(getByTestId('balanceCount').props.children).toBe(0)
  })
})
