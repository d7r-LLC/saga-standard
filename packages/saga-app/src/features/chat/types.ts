// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface Conversation {
  id: string
  agentHandle: string
  provider: string
  model: string
  title: string | null
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokensPrompt: number | null
  tokensCompletion: number | null
  costUsd: number | null
  latencyMs: number | null
  createdAt: string
}

export interface CreateConversationParams {
  agentHandle: string
  provider: string
  model: string
  systemPrompt?: string
}

export interface ChatConfig {
  provider: string
  model: string
  label: string
}

export const CHAT_PROVIDERS: ChatConfig[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet' },
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'google', model: 'gemini-2.0-flash', label: 'Gemini Flash' },
]
