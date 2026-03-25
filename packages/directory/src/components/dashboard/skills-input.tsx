// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { inputClassName } from './form-field'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags: number
  maxLength: number
  id?: string
}

function TagInput({
  value,
  onChange,
  placeholder,
  maxTags,
  maxLength,
  id,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const addTag = useCallback(() => {
    const tag = inputValue.trim()
    if (!tag) return
    if (tag.length > maxLength) return
    if (value.length >= maxTags) return
    if (value.includes(tag)) {
      setInputValue('')
      return
    }
    onChange([...value, tag])
    setInputValue('')
  }, [inputValue, value, onChange, maxTags, maxLength])

  const removeTag = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, index) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="rounded-full p-0.5 hover:bg-sky-100 dark:hover:bg-sky-800"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {value.length < maxTags && (
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`mt-2 ${inputClassName}`}
        />
      )}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {value.length}/{maxTags} — Press Enter to add
      </p>
    </div>
  )
}

interface SkillsInputProps {
  value: string[]
  onChange: (skills: string[]) => void
  id?: string
}

export function SkillsInput({ value, onChange, id }: SkillsInputProps) {
  return (
    <TagInput
      value={value}
      onChange={onChange}
      placeholder="e.g. code-review, data-analysis"
      maxTags={20}
      maxLength={40}
      id={id}
    />
  )
}
