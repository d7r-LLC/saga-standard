// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, X, XCircle } from 'lucide-react'
import clsx from 'clsx'

interface FormStatusProps {
  type: 'success' | 'error'
  message: string
  onDismiss?: () => void
}

export function FormStatus({ type, message, onDismiss }: FormStatusProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (type === 'success') {
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss?.()
      }, 5000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [type, onDismiss])

  if (!visible) return null

  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-md px-4 py-3 text-sm',
        type === 'success' &&
          'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400',
        type === 'error' &&
          'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      )}
      role="alert"
    >
      {type === 'success' ? (
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={() => {
            setVisible(false)
            onDismiss()
          }}
          className="shrink-0 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
