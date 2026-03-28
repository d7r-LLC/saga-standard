// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface Conversation {
  id: string
  agentHandle: string
  title: string | null
  provider: string
  model: string
  systemPrompt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  tokensPrompt?: number | null
  tokensCompletion?: number | null
  costUsd?: number | null
  latencyMs?: number | null
  createdAt: string
}

export interface CreateConversationParams {
  agentHandle: string
  provider: string
  model: string
  systemPrompt?: string
}

export interface ConversationWithMessages {
  conversation: Conversation
  messages: Message[]
}

export interface ListConversationsResult {
  conversations: Conversation[]
  total: number
  page: number
  limit: number
}

export interface SessionToken {
  token: string
  expiresAt: string
  walletAddress: string
}

export interface ProviderModel {
  id: string
  name: string
  description: string
}

export interface ProviderConfig {
  id: string
  name: string
  color: string
  models: ProviderModel[]
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#d97706',
    models: [
      {
        id: 'claude-sonnet-4-5-20250514',
        name: 'Claude Sonnet 4.5',
        description: 'Fast, intelligent',
      },
      {
        id: 'claude-haiku-3-5-20241022',
        name: 'Claude Haiku 3.5',
        description: 'Fastest, lightest',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10b981',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Versatile, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast, affordable' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    color: '#3b82f6',
    models: [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast, versatile' }],
  },
]
