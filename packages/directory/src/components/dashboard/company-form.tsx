// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useState } from 'react'
import { companyUpdateSchema } from '@/lib/validation/schemas'
import { FormField, inputClassName, textareaClassName } from './form-field'
import { FormStatus } from './form-status'

interface CompanyData {
  slug: string
  name: string
  logo: string | null
  banner: string | null
  tagline: string | null
  description: string | null
  industry: string | null
  website: string | null
  services: string[]
}

interface CompanyFormProps {
  company: CompanyData
}

type FormErrors = Record<string, string>

export function CompanyForm({ company }: CompanyFormProps) {
  const [name, setName] = useState(company.name)
  const [logo, setLogo] = useState(company.logo ?? '')
  const [banner, setBanner] = useState(company.banner ?? '')
  const [tagline, setTagline] = useState(company.tagline ?? '')
  const [description, setDescription] = useState(company.description ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [website, setWebsite] = useState(company.website ?? '')
  const [services, setServices] = useState<string[]>(company.services)
  const [serviceInput, setServiceInput] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const addService = useCallback(() => {
    const svc = serviceInput.trim()
    if (!svc || services.length >= 15 || services.includes(svc)) {
      setServiceInput('')
      return
    }
    setServices([...services, svc])
    setServiceInput('')
  }, [serviceInput, services])

  const removeService = useCallback(
    (index: number) => {
      setServices(services.filter((_, i) => i !== index))
    },
    [services],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setErrors({})
      setStatus(null)

      const payload = {
        name,
        logo: logo || null,
        banner: banner || null,
        tagline: tagline || null,
        description: description || null,
        industry: industry || null,
        website: website || null,
        services,
      }

      const parsed = companyUpdateSchema.safeParse(payload)
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
        const res = await fetch(`/api/companies/${company.slug}`, {
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

        setStatus({ type: 'success', message: 'Company profile updated.' })
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
      logo,
      banner,
      tagline,
      description,
      industry,
      website,
      services,
      company.slug,
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

      {/* Read-only slug */}
      <div className="rounded-md bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Identity (read-only)
        </p>
        <p className="mt-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Slug: </span>
          <span className="font-mono text-slate-900 dark:text-white">
            {company.slug}
          </span>
        </p>
      </div>

      <FormField
        label="Company Name"
        htmlFor="co-name"
        error={errors.name}
        required
      >
        <input
          id="co-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          className={inputClassName}
        />
      </FormField>

      <FormField label="Logo URL" htmlFor="co-logo" error={errors.logo}>
        <input
          id="co-logo"
          type="url"
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="https://example.com/logo.png"
          className={inputClassName}
        />
      </FormField>

      <FormField label="Banner URL" htmlFor="co-banner" error={errors.banner}>
        <input
          id="co-banner"
          type="url"
          value={banner}
          onChange={(e) => setBanner(e.target.value)}
          placeholder="https://example.com/banner.png"
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="Tagline"
        htmlFor="co-tagline"
        error={errors.tagline}
        hint="Max 160 characters"
      >
        <input
          id="co-tagline"
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={160}
          placeholder="Building the future of AI agents"
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor="co-desc"
        error={errors.description}
        hint="Max 2000 characters"
      >
        <textarea
          id="co-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Tell the world about your company..."
          className={textareaClassName}
        />
      </FormField>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          label="Industry"
          htmlFor="co-industry"
          error={errors.industry}
        >
          <input
            id="co-industry"
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            maxLength={60}
            placeholder="AI Development"
            className={inputClassName}
          />
        </FormField>

        <FormField label="Website" htmlFor="co-website" error={errors.website}>
          <input
            id="co-website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className={inputClassName}
          />
        </FormField>
      </div>

      {/* Services */}
      <FormField label="Services" htmlFor="co-services" error={errors.services}>
        <div>
          <div className="flex flex-wrap gap-1.5">
            {services.map((svc, index) => (
              <span
                key={svc}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300"
              >
                {svc}
                <button
                  type="button"
                  onClick={() => removeService(index)}
                  className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
                  aria-label={`Remove ${svc}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {services.length < 15 && (
            <input
              id="co-services"
              type="text"
              value={serviceInput}
              onChange={(e) => setServiceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addService()
                }
              }}
              placeholder="e.g. Code Review, Data Analysis"
              maxLength={60}
              className={`mt-2 ${inputClassName}`}
            />
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {services.length}/15 — Press Enter to add
          </p>
        </div>
      </FormField>

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
