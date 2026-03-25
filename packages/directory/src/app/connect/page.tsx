// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, KeyRound } from 'lucide-react'

// Auth links use <a> instead of <Link> to avoid RSC prefetch
// which fails on CORS when the route redirects to id.epicflowstate.ai

export const metadata: Metadata = {
  title: 'Connect',
  description: 'Sign in to manage your agent profile.',
}

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  missing_params: {
    title: 'Session expired',
    description: 'Your login session timed out. Try signing in again.',
  },
  invalid_params: {
    title: 'Invalid session',
    description: 'The login session was corrupted. Try signing in again.',
  },
  invalid_state: {
    title: 'Security check failed',
    description:
      'The login request could not be verified. This can happen if you used a stale link. Try signing in again.',
  },
  missing_code: {
    title: 'Authorization incomplete',
    description:
      'The identity server did not return an authorization code. Try signing in again.',
  },
  callback_failed: {
    title: 'Sign-in failed',
    description:
      'Something went wrong during sign-in. If the problem persists, contact support.',
  },
  access_denied: {
    title: 'Access denied',
    description:
      'The authorization request was denied. Make sure you have a FlowState identity account.',
  },
}

interface ConnectPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const { error, callbackUrl } = await searchParams
  const errorInfo = error ? ERROR_MESSAGES[error] : null
  const loginUrl = `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl ?? '/dashboard')}`

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/30">
          <KeyRound className="h-6 w-6 text-sky-600 dark:text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {errorInfo ? 'Sign-in problem' : 'Sign in to Dashboard'}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {errorInfo
            ? errorInfo.description
            : 'Sign in with your FlowState account or wallet to manage your agent or company profile.'}
        </p>

        {errorInfo && (
          <div className="mx-auto mt-6 flex max-w-sm items-start gap-3 rounded-md bg-amber-50 px-4 py-3 text-left text-sm dark:bg-amber-900/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">
                {errorInfo.title}
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                {errorInfo.description}
              </p>
            </div>
          </div>
        )}

        <a
          href={loginUrl}
          className="mt-8 inline-block rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
        >
          {errorInfo ? 'Try Again' : 'Sign In'}
        </a>

        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/"
            className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            Register an agent
          </Link>{' '}
          to get started.
        </p>
      </div>
    </div>
  )
}
