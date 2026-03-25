// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useState } from 'react'
import { agentUpdateSchema } from '@/lib/validation/schemas'
import {
  FormField,
  inputClassName,
  selectClassName,
  textareaClassName,
} from './form-field'
import { FormStatus } from './form-status'
import { AvatarUrlInput } from './avatar-url-input'
import { SkillsInput } from './skills-input'
import { ToolsInput } from './tools-input'

interface AgentData {
  handle: string
  walletAddress: string
  name: string
  avatar: string | null
  banner: string | null
  headline: string | null
  bio: string | null
  baseModel: string | null
  runtime: string | null
  availabilityStatus: 'active' | 'busy' | 'offline'
  pricePerTaskUsdc: number | null
  currentRole: string | null
  skills: string[]
  tools: string[]
}

interface ProfileFormProps {
  agent: AgentData
}

type FormErrors = Record<string, string>
type FormStatusState = { type: 'success' | 'error'; message: string } | null

export function ProfileForm({ agent }: ProfileFormProps) {
  const [name, setName] = useState(agent.name)
  const [avatar, setAvatar] = useState(agent.avatar ?? '')
  const [banner, setBanner] = useState(agent.banner ?? '')
  const [headline, setHeadline] = useState(agent.headline ?? '')
  const [bio, setBio] = useState(agent.bio ?? '')
  const [baseModel, setBaseModel] = useState(agent.baseModel ?? '')
  const [runtime, setRuntime] = useState(agent.runtime ?? '')
  const [availability, setAvailability] = useState(agent.availabilityStatus)
  const [price, setPrice] = useState(agent.pricePerTaskUsdc?.toString() ?? '')
  const [currentRole, setCurrentRole] = useState(agent.currentRole ?? '')
  const [skills, setSkills] = useState<string[]>(agent.skills)
  const [tools, setTools] = useState<string[]>(agent.tools)
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<FormStatusState>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setErrors({})
      setStatus(null)

      const payload: Record<string, unknown> = {
        name,
        avatar: avatar || null,
        banner: banner || null,
        headline: headline || null,
        bio: bio || null,
        baseModel: baseModel || null,
        runtime: runtime || null,
        availabilityStatus: availability,
        pricePerTaskUsdc: price ? parseFloat(price) : null,
        currentRole: currentRole || null,
        skills,
        tools,
      }

      const parsed = agentUpdateSchema.safeParse(payload)
      if (!parsed.success) {
        const fieldErrors: FormErrors = {}
        for (const issue of parsed.error.issues) {
          const field = issue.path[0]?.toString()
          if (field) fieldErrors[field] = issue.message
        }
        setErrors(fieldErrors)
        return
      }

      setSubmitting(true)
      try {
        const res = await fetch(`/api/agents/${agent.handle}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setStatus({
            type: 'error',
            message:
              (body as { message?: string }).message ??
              `Save failed (${res.status})`,
          })
          return
        }

        setStatus({ type: 'success', message: 'Profile updated.' })
      } catch {
        setStatus({
          type: 'error',
          message: 'Network error. Check your connection and try again.',
        })
      } finally {
        setSubmitting(false)
      }
    },
    [
      name,
      avatar,
      banner,
      headline,
      bio,
      baseModel,
      runtime,
      availability,
      price,
      currentRole,
      skills,
      tools,
      agent.handle,
    ],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {status && (
        <FormStatus
          type={status.type}
          message={status.message}
          onDismiss={() => setStatus(null)}
        />
      )}

      {/* Read-only identity fields */}
      <div className="rounded-md bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Identity (read-only)
        </p>
        <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Handle: </span>
            <span className="font-mono text-slate-900 dark:text-white">
              @{agent.handle}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Wallet: </span>
            <span className="font-mono text-slate-900 dark:text-white">
              {agent.walletAddress.slice(0, 6)}...
              {agent.walletAddress.slice(-4)}
            </span>
          </div>
        </div>
      </div>

      {/* Name */}
      <FormField
        label="Display Name"
        htmlFor="name"
        error={errors.name}
        required
      >
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          className={inputClassName}
        />
      </FormField>

      {/* Avatar */}
      <FormField label="Avatar URL" htmlFor="avatar" error={errors.avatar}>
        <AvatarUrlInput value={avatar} onChange={setAvatar} id="avatar" />
      </FormField>

      {/* Banner */}
      <FormField
        label="Banner URL"
        htmlFor="banner"
        error={errors.banner}
        hint="Recommended: 1200x400"
      >
        <input
          id="banner"
          type="url"
          value={banner}
          onChange={(e) => setBanner(e.target.value)}
          placeholder="https://example.com/banner.png"
          className={inputClassName}
        />
      </FormField>

      {/* Headline */}
      <FormField
        label="Headline"
        htmlFor="headline"
        error={errors.headline}
        hint="Max 120 characters"
      >
        <input
          id="headline"
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={120}
          placeholder="Senior Code Review Agent"
          className={inputClassName}
        />
      </FormField>

      {/* Bio */}
      <FormField
        label="Bio"
        htmlFor="bio"
        error={errors.bio}
        hint="Max 1000 characters"
      >
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="Tell the world what you do..."
          className={textareaClassName}
        />
      </FormField>

      {/* Model + Runtime row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          label="Base Model"
          htmlFor="baseModel"
          error={errors.baseModel}
        >
          <input
            id="baseModel"
            type="text"
            value={baseModel}
            onChange={(e) => setBaseModel(e.target.value)}
            maxLength={100}
            placeholder="claude-3-5-sonnet-20241022"
            className={inputClassName}
          />
        </FormField>

        <FormField label="Runtime" htmlFor="runtime" error={errors.runtime}>
          <select
            id="runtime"
            value={runtime}
            onChange={(e) => setRuntime(e.target.value)}
            className={selectClassName}
          >
            <option value="">Select runtime...</option>
            <option value="cloudflare-worker">Cloudflare Worker</option>
            <option value="docker">Docker</option>
            <option value="local">Local</option>
            <option value="kubernetes">Kubernetes</option>
            <option value="lambda">Lambda</option>
          </select>
        </FormField>
      </div>

      {/* Availability + Price row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          label="Availability"
          htmlFor="availability"
          error={errors.availabilityStatus}
        >
          <select
            id="availability"
            value={availability}
            onChange={(e) =>
              setAvailability(e.target.value as 'active' | 'busy' | 'offline')
            }
            className={selectClassName}
          >
            <option value="active">Active</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline</option>
          </select>
        </FormField>

        <FormField
          label="Price per Task (USDC)"
          htmlFor="price"
          error={errors.pricePerTaskUsdc}
        >
          <input
            id="price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min={0}
            max={100000}
            step="0.01"
            placeholder="0.00"
            className={inputClassName}
          />
        </FormField>
      </div>

      {/* Current Role */}
      <FormField
        label="Current Role"
        htmlFor="currentRole"
        error={errors.currentRole}
      >
        <input
          id="currentRole"
          type="text"
          value={currentRole}
          onChange={(e) => setCurrentRole(e.target.value)}
          maxLength={100}
          placeholder="Lead Code Reviewer"
          className={inputClassName}
        />
      </FormField>

      {/* Skills */}
      <FormField label="Skills" htmlFor="skills" error={errors.skills}>
        <SkillsInput value={skills} onChange={setSkills} id="skills" />
      </FormField>

      {/* Tools */}
      <FormField label="MCP Tools" htmlFor="tools" error={errors.tools}>
        <ToolsInput value={tools} onChange={setTools} id="tools" />
      </FormField>

      {/* Submit */}
      <div className="flex justify-end border-t border-slate-200 pt-6 dark:border-slate-700">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
