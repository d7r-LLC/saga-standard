// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export type Provider = 'anthropic' | 'openai' | 'gemini'

export interface StreamCallOptions {
  provider: Provider
  model: string
  apiKey: string
  systemPrompt?: string
  userPrompt: string
  maxTokens: number
  /** Emit deltas as they arrive (e.g., process.stdout.write). */
  onDelta?: (text: string) => void
}

export interface StreamCallResult {
  text: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export async function streamCompletion(opts: StreamCallOptions): Promise<StreamCallResult> {
  if (opts.provider === 'anthropic') return streamAnthropic(opts)
  if (opts.provider === 'openai') return streamOpenAI(opts)
  if (opts.provider === 'gemini') return streamGemini(opts)
  throw new Error(`Unknown provider: ${opts.provider}`)
}

async function streamAnthropic(opts: StreamCallOptions): Promise<StreamCallResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    stream: true,
    messages: [{ role: 'user', content: opts.userPrompt }],
  }
  if (opts.systemPrompt) body.system = opts.systemPrompt

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${errorText}`)
  }

  const chunks: string[] = []
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  await streamSSE(res, (event, data) => {
    if (event === 'content_block_delta') {
      try {
        const parsed = JSON.parse(data)
        const t = parsed.delta?.text
        if (t) {
          chunks.push(t)
          opts.onDelta?.(t)
        }
      } catch {
        // ignore
      }
    } else if (event === 'message_start') {
      try {
        const parsed = JSON.parse(data)
        inputTokens = parsed.message?.usage?.input_tokens ?? inputTokens
      } catch {
        // ignore
      }
    } else if (event === 'message_delta') {
      try {
        const parsed = JSON.parse(data)
        outputTokens = parsed.usage?.output_tokens ?? outputTokens
      } catch {
        // ignore
      }
    }
  })

  return { text: chunks.join(''), usage: { inputTokens, outputTokens } }
}

async function streamOpenAI(opts: StreamCallOptions): Promise<StreamCallResult> {
  const messages: Array<{ role: string; content: string }> = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: opts.userPrompt })

  // GPT-5+ and reasoning models (o1/o3/...) require `max_completion_tokens`.
  // Older chat models (gpt-4o, gpt-4.1, gpt-3.5) use `max_tokens`.
  // Match a leading `o<digit>` (reasoning models) or `gpt-5` prefix.
  const usesCompletionTokens = /^(o\d|gpt-5)/i.test(opts.model)
  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  }
  if (usesCompletionTokens) {
    body.max_completion_tokens = opts.maxTokens
  } else {
    body.max_tokens = opts.maxTokens
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenAI API ${res.status}: ${errorText}`)
  }

  const chunks: string[] = []
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  await streamSSE(res, (_event, data) => {
    if (data === '[DONE]') return
    try {
      const parsed = JSON.parse(data)
      const content = parsed.choices?.[0]?.delta?.content
      if (content) {
        chunks.push(content)
        opts.onDelta?.(content)
      }
      if (parsed.usage) {
        inputTokens = parsed.usage.prompt_tokens ?? inputTokens
        outputTokens = parsed.usage.completion_tokens ?? outputTokens
      }
    } catch {
      // ignore non-JSON
    }
  })

  return { text: chunks.join(''), usage: { inputTokens, outputTokens } }
}

async function streamGemini(opts: StreamCallOptions): Promise<StreamCallResult> {
  // Native Gemini streaming endpoint with SSE encoding.
  // Docs: https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model
  )}:streamGenerateContent?alt=sse`

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
    },
  }
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': opts.apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Gemini API ${res.status}: ${errorText}`)
  }

  const chunks: string[] = []
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  await streamSSE(res, (_event, data) => {
    if (!data || data === '[DONE]') return
    try {
      const parsed = JSON.parse(data)
      const parts = parsed.candidates?.[0]?.content?.parts
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part?.text === 'string' && part.text.length > 0) {
            chunks.push(part.text)
            opts.onDelta?.(part.text)
          }
        }
      }
      // Usage metadata appears on later events; the final one carries totals.
      if (parsed.usageMetadata) {
        inputTokens = parsed.usageMetadata.promptTokenCount ?? inputTokens
        outputTokens = parsed.usageMetadata.candidatesTokenCount ?? outputTokens
      }
    } catch {
      // ignore malformed lines
    }
  })

  return { text: chunks.join(''), usage: { inputTokens, outputTokens } }
}

async function streamSSE(res: Response, handler: (event: string, data: string) => void) {
  if (!res.body) throw new Error('response has no body to stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        handler(currentEvent || 'data', line.slice(6))
      } else if (line.trim() === '') {
        currentEvent = ''
      }
    }
  }
  if (buffer.startsWith('data: ')) {
    handler(currentEvent || 'data', buffer.slice(6))
  }
}
