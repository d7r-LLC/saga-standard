// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import {
  countAgentsByCompany,
  getAgentByHandle,
  getAgentByWallet,
  searchAgents,
} from '@/db/queries/agents'
import {
  getCompanyBySlug,
  getCompanyByWallet,
  searchCompanies,
} from '@/db/queries/companies'
import {
  countPendingByWallet,
  createRegistration,
  getRegistrationById,
} from '@/db/queries/registrations'
import { getWorkHistoryForAgent } from '@/db/queries/work-history'
import { X402PaymentService } from '@/lib/payment/x402'
import { buildRegistrationStatusFields } from '@/lib/registration-status'
import { buildSagaDocument } from '@/lib/saga/export'
import {
  agentRegistrationSchema,
  companyRegistrationSchema,
} from '@/lib/validation/schemas'

const AGENT_REGISTRATION_AMOUNT = '5.00'
const COMPANY_REGISTRATION_AMOUNT = '10.00'
const MAX_PENDING_PER_WALLET = 3

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function err(message: string): ToolResult {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ error: message }) },
    ],
    isError: true,
  }
}

// --- Read tools (no auth required) ---

export async function handleFindAgents(
  db: Db,
  args: {
    query?: string
    skills?: string
    model?: string
    availability?: string
    verified_only?: boolean
    page?: number
    limit?: number
  },
): Promise<ToolResult> {
  const result = await searchAgents(db, {
    q: args.query,
    skills: args.skills
      ? args.skills.split(',').map((s) => s.trim())
      : undefined,
    model: args.model,
    availability: args.availability,
    verifiedOnly: args.verified_only ?? true,
    page: args.page ?? 1,
    limit: Math.min(args.limit ?? 10, 50),
  })

  return ok({
    agents: result.agents.map((a: Record<string, unknown>) => ({
      handle: a.handle,
      name: a.name,
      headline: a.headline,
      availabilityStatus: a.availabilityStatus,
      baseModel: a.baseModel,
      skills: a.skills,
      pricePerTaskUsdc: a.pricePerTaskUsdc,
      profileType: a.profileType,
      profileUrl: `/a/${a.handle}`,
    })),
    total: result.total,
    page: result.page,
    limit: result.limit,
  })
}

export async function handleGetAgent(
  db: Db,
  args: { handle: string },
): Promise<ToolResult> {
  const agent = await getAgentByHandle(db, args.handle)
  if (!agent || agent.isVerified === 0) {
    return err(`Agent @${args.handle} not found`)
  }

  const history = await getWorkHistoryForAgent(db, agent.id)

  return ok({
    handle: agent.handle,
    name: agent.name,
    headline: agent.headline,
    bio: agent.bio,
    walletAddress: agent.walletAddress,
    chain: agent.chain,
    availabilityStatus: agent.availabilityStatus,
    baseModel: agent.baseModel,
    runtime: agent.runtime,
    skills: agent.skills,
    tools: agent.tools,
    pricePerTaskUsdc: agent.pricePerTaskUsdc,
    profileType: agent.profileType,
    createdAt: agent.createdAt,
    workHistory: history.map((e: Record<string, unknown>) => ({
      role: e.role,
      companyName: e.companyName,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
  })
}

export async function handleGetAgentSaga(
  db: Db,
  args: { handle: string; export_type?: string },
): Promise<ToolResult> {
  const agent = await getAgentByHandle(db, args.handle)
  if (!agent || agent.isVerified === 0) {
    return err(`Agent @${args.handle} not found`)
  }

  const exportType = args.export_type === 'profile' ? 'profile' : 'identity'
  const doc = buildSagaDocument(agent, exportType)
  return ok(doc)
}

export async function handleFindCompanies(
  db: Db,
  args: { query?: string; industry?: string; page?: number; limit?: number },
): Promise<ToolResult> {
  const result = await searchCompanies(db, {
    q: args.query,
    industry: args.industry,
    page: args.page ?? 1,
    limit: Math.min(args.limit ?? 10, 50),
  })

  return ok({
    companies: result.companies.map((c: Record<string, unknown>) => ({
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      industry: c.industry,
      services: c.services,
    })),
    total: result.total,
    page: result.page,
    limit: result.limit,
  })
}

export async function handleGetCompany(
  db: Db,
  args: { slug: string },
): Promise<ToolResult> {
  const company = await getCompanyBySlug(db, args.slug)
  if (!company) {
    return err(`Company "${args.slug}" not found`)
  }

  const teamCount = await countAgentsByCompany(db, company.id)

  return ok({
    slug: company.slug,
    name: company.name,
    tagline: company.tagline,
    description: company.description,
    industry: company.industry,
    website: company.website,
    services: company.services,
    walletAddress: company.walletAddress,
    chain: company.chain,
    teamCount,
    verificationStatus: company.verificationStatus,
    createdAt: company.createdAt,
  })
}

// --- Write tools (auth required) ---

export async function handleRegisterAgent(
  db: Db,
  args: {
    handle: string
    name: string
    wallet_address: string
    headline?: string
    bio?: string
    base_model?: string
    runtime?: string
    skills?: string[]
    tools?: string[]
    price_per_task_usdc?: number
    profile_type?: string
  },
  options?: { registrationEnabled?: boolean; treasuryWalletAddress?: string },
): Promise<ToolResult> {
  if (!options?.registrationEnabled) {
    return err('Registration is not currently available. Check back soon.')
  }

  // Remap snake_case tool args to camelCase schema fields
  const input = {
    handle: args.handle,
    name: args.name,
    walletAddress: args.wallet_address,
    headline: args.headline,
    bio: args.bio,
    baseModel: args.base_model,
    runtime: args.runtime,
    skills: args.skills,
    tools: args.tools,
    pricePerTaskUsdc: args.price_per_task_usdc,
    profileType: args.profile_type,
  }

  const parsed = agentRegistrationSchema.safeParse(input)
  if (!parsed.success) {
    return err(
      `Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    )
  }

  const existingHandle = await getAgentByHandle(db, parsed.data.handle)
  if (existingHandle) {
    return err(`Handle @${parsed.data.handle} is already taken`)
  }

  const existingWallet = await getAgentByWallet(db, parsed.data.walletAddress)
  if (existingWallet) {
    return err('Wallet address already registered')
  }

  const pendingCount = await countPendingByWallet(db, parsed.data.walletAddress)
  if (pendingCount >= MAX_PENDING_PER_WALLET) {
    return err('Too many pending registrations for this wallet')
  }

  const treasuryWallet = options?.treasuryWalletAddress
  if (!treasuryWallet) {
    return err('Payment configuration not available. Contact support.')
  }
  let paymentService: X402PaymentService
  try {
    paymentService = new X402PaymentService({
      treasuryWalletAddress: treasuryWallet,
    })
  } catch {
    return err('Payment service misconfigured. Contact support.')
  }
  const paymentRequest = await paymentService.createPaymentRequest({
    amountUsdc: AGENT_REGISTRATION_AMOUNT,
    recipientAddress: treasuryWallet,
    memo: `Agent registration: ${parsed.data.handle}`,
  })

  const registration = await createRegistration(db, {
    entityType: 'agent',
    walletAddress: parsed.data.walletAddress,
    amountUsdc: AGENT_REGISTRATION_AMOUNT,
    expiresAt: paymentRequest.expiresAt,
    paymentRequest: {
      ...paymentRequest.paymentDetails,
      paymentId: paymentRequest.paymentId,
      agentData: parsed.data,
    },
  })

  return ok({
    registrationId: registration.id,
    status: 'pending',
    amount: AGENT_REGISTRATION_AMOUNT,
    currency: 'USDC',
    chain: 'eip155:8453',
    expiresAt: paymentRequest.expiresAt,
    instructions:
      'Complete the payment to finalize registration. Use get_registration_status to check progress.',
  })
}

export async function handleRegisterCompany(
  db: Db,
  args: {
    slug: string
    name: string
    wallet_address: string
    tagline?: string
    description?: string
    industry?: string
    website?: string
    services?: string[]
  },
  options?: { registrationEnabled?: boolean; treasuryWalletAddress?: string },
): Promise<ToolResult> {
  if (!options?.registrationEnabled) {
    return err('Registration is not currently available. Check back soon.')
  }

  const input = {
    slug: args.slug,
    name: args.name,
    walletAddress: args.wallet_address,
    tagline: args.tagline,
    description: args.description,
    industry: args.industry,
    website: args.website,
    services: args.services,
  }

  const parsed = companyRegistrationSchema.safeParse(input)
  if (!parsed.success) {
    return err(
      `Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    )
  }

  const existingSlug = await getCompanyBySlug(db, parsed.data.slug)
  if (existingSlug) {
    return err(`Slug "${parsed.data.slug}" is already taken`)
  }

  const existingWallet = await getCompanyByWallet(db, parsed.data.walletAddress)
  if (existingWallet) {
    return err('Wallet address already registered as a company')
  }

  const pendingCount = await countPendingByWallet(db, parsed.data.walletAddress)
  if (pendingCount >= MAX_PENDING_PER_WALLET) {
    return err('Too many pending registrations for this wallet')
  }

  const treasuryWallet = options?.treasuryWalletAddress
  if (!treasuryWallet) {
    return err('Payment configuration not available. Contact support.')
  }
  let paymentService: X402PaymentService
  try {
    paymentService = new X402PaymentService({
      treasuryWalletAddress: treasuryWallet,
    })
  } catch {
    return err('Payment service misconfigured. Contact support.')
  }
  const paymentRequest = await paymentService.createPaymentRequest({
    amountUsdc: COMPANY_REGISTRATION_AMOUNT,
    recipientAddress: treasuryWallet,
    memo: `Company registration: ${parsed.data.slug}`,
  })

  const registration = await createRegistration(db, {
    entityType: 'company',
    walletAddress: parsed.data.walletAddress,
    amountUsdc: COMPANY_REGISTRATION_AMOUNT,
    expiresAt: paymentRequest.expiresAt,
    paymentRequest: {
      ...paymentRequest.paymentDetails,
      paymentId: paymentRequest.paymentId,
      companyData: parsed.data,
    },
  })

  return ok({
    registrationId: registration.id,
    status: 'pending',
    amount: COMPANY_REGISTRATION_AMOUNT,
    currency: 'USDC',
    chain: 'eip155:8453',
    expiresAt: paymentRequest.expiresAt,
    instructions:
      'Complete the payment to finalize registration. Use get_registration_status to check progress.',
  })
}

export async function handleGetRegistrationStatus(
  db: Db,
  args: { registration_id: string },
): Promise<ToolResult> {
  const reg = await getRegistrationById(db, args.registration_id)
  if (!reg) {
    return err('Registration not found')
  }

  const { profileUrl, message } = buildRegistrationStatusFields(reg)

  return ok({
    registrationId: reg.id,
    status: reg.status,
    entityType: reg.entityType,
    entityId: reg.entityId,
    expiresAt: reg.expiresAt,
    confirmedAt: reg.confirmedAt,
    profileUrl,
    message,
  })
}
