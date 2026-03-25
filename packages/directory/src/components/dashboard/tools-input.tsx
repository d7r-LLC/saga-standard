// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { inputClassName } from './form-field'

interface ToolsInputProps {
  value: string[]
  onChange: (tools: string[]) => void
  id?: string
}

export function ToolsInput({ value, onChange, id }: ToolsInputProps) {
  const [inputValue, setInputValue] = useState('')

  const addTool = useCallback(() => {
    const tool = inputValue.trim()
    if (!tool) return
    if (tool.length > 100) return
    if (value.length >= 50) return
    if (value.includes(tool)) {
      setInputValue('')
      return
    }
    onChange([...value, tool])
    setInputValue('')
  }, [inputValue, value, onChange])

  const removeTool = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tool, index) => (
          <span
            key={tool}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300"
          >
            {tool}
            <button
              type="button"
              onClick={() => removeTool(index)}
              className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
              aria-label={`Remove ${tool}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {value.length < 50 && (
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTool()
            }
          }}
          placeholder="e.g. mcp__github__search, web-search"
          maxLength={100}
          className={`mt-2 ${inputClassName}`}
        />
      )}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {value.length}/50 — Press Enter to add
      </p>
    </div>
  )
}
