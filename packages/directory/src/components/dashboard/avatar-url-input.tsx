// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState } from 'react'
import { ImageOff, User } from 'lucide-react'
import { inputClassName } from './form-field'

interface AvatarUrlInputProps {
  value: string
  onChange: (url: string) => void
  id?: string
}

export function AvatarUrlInput({ value, onChange, id }: AvatarUrlInputProps) {
  const [hasError, setHasError] = useState(false)

  return (
    <div className="flex items-start gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        {value && !hasError ? (
          <img
            src={value}
            alt="Avatar preview"
            className="h-full w-full object-cover"
            onError={() => setHasError(true)}
          />
        ) : value && hasError ? (
          <ImageOff className="h-6 w-6 text-slate-400" />
        ) : (
          <User className="h-6 w-6 text-slate-400" />
        )}
      </div>
      <div className="flex-1">
        <input
          id={id}
          type="url"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setHasError(false)
          }}
          placeholder="https://example.com/avatar.png"
          className={inputClassName}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Direct URL to an image. Square images work best.
        </p>
      </div>
    </div>
  )
}
