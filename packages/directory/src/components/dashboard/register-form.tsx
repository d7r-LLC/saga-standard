// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SkillsInput } from './skills-input'
import { ToolsInput } from './tools-input'

interface RegisterFormProps {
  userName: string
  userEmail: string
}

const RUNTIME_OPTIONS = [
  { value: '', label: 'Select runtime...' },
  { value: 'cloudflare-worker', label: 'Cloudflare Worker' },
  { value: 'docker', label: 'Docker' },
  { value: 'local', label: 'Local' },
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 'lambda', label: 'Lambda' },
]

const PROFILE_TYPE_OPTIONS = [
  { value: 'agent', label: 'AI Agent' },
  { value: 'human', label: 'Human' },
  { value: 'hybrid', label: 'Hybrid' },
]

type RegistrationStep = 'form' | 'payment' | 'confirmed' | 'expired'

interface PaymentInfo {
  registrationId: string
  amount: string
  recipientAddress: string
  chain: string
  paymentDetails: Record<string, unknown>
  expiresAt: string
}

export function RegisterForm({ userName, userEmail }: RegisterFormProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<RegistrationStep>('form')
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null)

  const [handle, setHandle] = useState('')
  const [name, setName] = useState(userName || '')
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [baseModel, setBaseModel] = useState('')
  const [runtime, setRuntime] = useState('')
  const [profileType, setProfileType] = useState('agent')
  const [walletAddress, setWalletAddress] = useState('')
  const [pricePerTaskUsdc, setPricePerTaskUsdc] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [tools, setTools] = useState<string[]>([])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setSubmitting(true)

      try {
        const body: Record<string, unknown> = {
          handle,
          name,
          walletAddress,
        }
        if (headline) body.headline = headline
        if (bio) body.bio = bio
        if (baseModel) body.baseModel = baseModel
        if (runtime) body.runtime = runtime
        if (profileType !== 'agent') body.profileType = profileType
        if (skills.length > 0) body.skills = skills
        if (tools.length > 0) body.tools = tools
        if (pricePerTaskUsdc)
          body.pricePerTaskUsdc = parseFloat(pricePerTaskUsdc)

        const res = await fetch('/api/register/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const data = (await res.json()) as {
          registrationId?: string
          amount?: string
          message?: string
        }

        if (!res.ok) {
          setError(data.message || 'Registration failed')
          setSubmitting(false)
          return
        }

        // Transition to payment waiting step
        const paymentData = data as {
          registrationId: string
          paymentRequest: {
            amountUsdc: string
            recipientAddress: string
            chain: string
            paymentDetails: Record<string, unknown>
            expiresAt: string
          }
          amount: string
        }

        setPaymentInfo({
          registrationId: paymentData.registrationId,
          amount: paymentData.amount,
          recipientAddress: paymentData.paymentRequest.recipientAddress,
          chain: paymentData.paymentRequest.chain,
          paymentDetails: paymentData.paymentRequest.paymentDetails,
          expiresAt: paymentData.paymentRequest.expiresAt,
        })
        setStep('payment')
        setSubmitting(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setSubmitting(false)
      }
    },
    [
      handle,
      name,
      headline,
      bio,
      baseModel,
      runtime,
      profileType,
      walletAddress,
      pricePerTaskUsdc,
      skills,
      tools,
    ],
  )

  useEffect(() => {
    if (step !== 'payment' || !paymentInfo) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/register/status/${paymentInfo.registrationId}`,
        )
        if (!res.ok) return // Retry on next tick
        const data = (await res.json()) as { status: string; entityId?: string }

        if (data.status === 'confirmed') {
          clearInterval(interval)
          setStep('confirmed')
          router.push('/dashboard/profile')
          router.refresh()
        } else if (data.status === 'expired' || data.status === 'failed') {
          clearInterval(interval)
          setStep('expired')
        }
      } catch {
        // Polling failure is not fatal — retry on next tick
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [step, paymentInfo, router])

  return (
    <>
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {step === 'payment' && paymentInfo && (
        <div className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Complete Payment
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Send <strong>{paymentInfo.amount} USDC</strong> to the address
              below on Base to complete your registration.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Send to
                </label>
                <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:bg-slate-800 dark:text-white">
                  {paymentInfo.recipientAddress}
                </code>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Amount
                  </label>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {paymentInfo.amount} USDC
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Network
                  </label>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    Base (Chain ID 8453)
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Waiting for payment confirmation...
          </div>
        </div>
      )}

      {step === 'expired' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">
            Payment Expired
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The payment window has closed. Start a new registration to try
            again.
          </p>
          <button
            onClick={() => {
              setStep('form')
              setPaymentInfo(null)
              setError(null)
            }}
            className="mt-4 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            Try Again
          </button>
        </div>
      )}

      {step === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Identity */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900 dark:text-white">
              Identity
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="handle"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Handle <span className="text-red-500">*</span>
                </label>
                <input
                  id="handle"
                  type="text"
                  required
                  value={handle}
                  onChange={(e) =>
                    setHandle(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    )
                  }
                  placeholder="my-agent"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  maxLength={30}
                  minLength={3}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Lowercase letters, numbers, hyphens. 3-30 chars.
                </p>
              </div>
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Agent"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  maxLength={60}
                  minLength={2}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="walletAddress"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Wallet Address <span className="text-red-500">*</span>
              </label>
              <input
                id="walletAddress"
                type="text"
                required
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                pattern="^0x[0-9a-fA-F]{40}$"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                EVM address. This becomes the permanent agent identity.
              </p>
            </div>
            <div>
              <label
                htmlFor="profileType"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Profile Type
              </label>
              <div className="mt-1 flex gap-4">
                {PROFILE_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="radio"
                      name="profileType"
                      value={opt.value}
                      checked={profileType === opt.value}
                      onChange={(e) => setProfileType(e.target.value)}
                      className="text-sky-500 focus:ring-sky-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          {/* Details */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900 dark:text-white">
              Details
            </legend>
            <div>
              <label
                htmlFor="headline"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Headline
              </label>
              <input
                id="headline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Full-stack coding agent specializing in TypeScript"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                maxLength={120}
              />
            </div>
            <div>
              <label
                htmlFor="bio"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="What does this agent do? What makes it unique?"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                maxLength={1000}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="baseModel"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Base Model
                </label>
                <input
                  id="baseModel"
                  type="text"
                  value={baseModel}
                  onChange={(e) => setBaseModel(e.target.value)}
                  placeholder="claude-sonnet-4-20250514"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  maxLength={100}
                />
              </div>
              <div>
                <label
                  htmlFor="runtime"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Runtime
                </label>
                <select
                  id="runtime"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  {RUNTIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label
                htmlFor="pricePerTaskUsdc"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Price per Task (USDC)
              </label>
              <input
                id="pricePerTaskUsdc"
                type="number"
                value={pricePerTaskUsdc}
                onChange={(e) => setPricePerTaskUsdc(e.target.value)}
                placeholder="0.00"
                min="0"
                max="100000"
                step="0.01"
                className="mt-1 block w-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </fieldset>

          {/* Skills & Tools */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900 dark:text-white">
              Skills & Tools
            </legend>
            <SkillsInput value={skills} onChange={setSkills} />
            <ToolsInput value={tools} onChange={setTools} />
          </fieldset>

          {/* Cost notice */}
          <div className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
            Registration costs{' '}
            <strong className="text-slate-900 dark:text-white">5 USDC</strong>{' '}
            on Base. You will be prompted to send payment after submitting this
            form.
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register Agent'}
            </button>
            <p className="text-xs text-slate-500">Logged in as {userEmail}</p>
          </div>
        </form>
      )}
    </>
  )
}
