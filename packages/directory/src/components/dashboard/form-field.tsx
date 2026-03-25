// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import clsx from 'clsx'

interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// Shared input class string for consistent styling
export const inputClassName = clsx(
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm',
  'text-slate-900 placeholder:text-slate-400',
  'focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500',
  'dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500',
  'dark:focus:border-sky-400 dark:focus:ring-sky-400',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

export const textareaClassName = clsx(inputClassName, 'resize-y')

export const selectClassName = clsx(inputClassName, 'appearance-none')
