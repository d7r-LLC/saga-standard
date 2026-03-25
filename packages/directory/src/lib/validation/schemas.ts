// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'

const RESERVED_WORDS = [
  'api',
  'admin',
  'health',
  'mcp',
  'dashboard',
  'companies',
  'agents',
  'connect',
  'auth',
  'register',
  'webhooks',
  'settings',
  'sitemap',
  'robots',
]

export const handleSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Must be lowercase alphanumeric with hyphens, cannot start or end with hyphen',
  )
  .refine((val) => !RESERVED_WORDS.includes(val), {
    message: 'This handle is reserved',
  })

export const slugSchema = z
  .string()
  .min(2)
  .max(30)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Must be lowercase alphanumeric with hyphens',
  )
  .refine((val) => !RESERVED_WORDS.includes(val), {
    message: 'This slug is reserved',
  })

export const walletAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM wallet address')

const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM format')

const skillTagSchema = z.string().min(1).max(40)

// --- Registration schemas ---

export const agentRegistrationSchema = z.object({
  handle: handleSchema,
  name: z.string().min(2).max(60),
  headline: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  baseModel: z.string().max(100).optional(),
  runtime: z
    .enum(['cloudflare-worker', 'docker', 'local', 'kubernetes', 'lambda'])
    .optional(),
  tools: z.array(z.string().max(100)).max(50).optional(),
  skills: z.array(skillTagSchema).max(20).optional(),
  walletAddress: walletAddressSchema,
  pricePerTaskUsdc: z.number().min(0).max(100000).optional(),
  profileType: z.enum(['agent', 'human', 'hybrid']).optional(),
})

export type AgentRegistrationInput = z.infer<typeof agentRegistrationSchema>

export const companyRegistrationSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(80),
  tagline: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().max(60).optional(),
  website: z.string().url().optional(),
  services: z.array(z.string().max(60)).max(15).optional(),
  walletAddress: walletAddressSchema,
})

export type CompanyRegistrationInput = z.infer<typeof companyRegistrationSchema>

// --- Update schemas (partial, immutable fields excluded) ---

export const agentUpdateSchema = z
  .object({
    name: z.string().min(2).max(60),
    avatar: z.string().url().nullable(),
    banner: z.string().url().nullable(),
    headline: z.string().max(120).nullable(),
    bio: z.string().max(1000).nullable(),
    baseModel: z.string().max(100).nullable(),
    runtime: z
      .enum(['cloudflare-worker', 'docker', 'local', 'kubernetes', 'lambda'])
      .nullable(),
    tools: z.array(z.string().max(100)).max(50),
    skills: z.array(skillTagSchema).max(20),
    availabilityStatus: z.enum(['active', 'busy', 'offline']),
    pricePerTaskUsdc: z.number().min(0).max(100000).nullable(),
    currentRole: z.string().max(100).nullable(),
    currentCompanyId: z.string().nullable(),
  })
  .partial()
  .strict()

export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>

export const companyUpdateSchema = z
  .object({
    name: z.string().min(2).max(80),
    logo: z.string().url().nullable(),
    banner: z.string().url().nullable(),
    tagline: z.string().max(160).nullable(),
    description: z.string().max(2000).nullable(),
    industry: z.string().max(60).nullable(),
    website: z.string().url().nullable(),
    services: z.array(z.string().max(60)).max(15),
  })
  .partial()
  .strict()

export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>

// --- Work history schemas ---

export const workHistoryCreateSchema = z.object({
  companyId: z.string().optional(),
  companyName: z.string().max(100).optional(),
  role: z.string().min(1).max(100),
  startDate: yearMonthSchema,
  endDate: yearMonthSchema.nullable().optional(),
  description: z.string().max(2000).optional(),
})

export type WorkHistoryCreateInput = z.infer<typeof workHistoryCreateSchema>

export const workHistoryUpdateSchema = workHistoryCreateSchema
  .partial()
  .strict()
export type WorkHistoryUpdateInput = z.infer<typeof workHistoryUpdateSchema>

// --- Query param schemas ---

export const agentSearchSchema = z.object({
  q: z.string().max(200).optional(),
  skills: z.string().optional(), // comma-separated
  role: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  availability: z.enum(['active', 'busy', 'any']).optional().default('any'),
  verifiedOnly: z.coerce.boolean().optional().default(true),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

export const companySearchSchema = z.object({
  q: z.string().max(200).optional(),
  industry: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})
