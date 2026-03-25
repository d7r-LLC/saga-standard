// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  handleFindAgents,
  handleFindCompanies,
  handleGetAgent,
  handleGetAgentSaga,
  handleGetCompany,
  handleGetRegistrationStatus,
  handleRegisterAgent,
  handleRegisterCompany,
} from './handlers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

interface McpServerOptions {
  registrationEnabled?: boolean
  treasuryWalletAddress?: string
}

/**
 * Creates an MCP server with directory discovery and registration tools.
 *
 * Read tools (find_agents, get_agent, get_agent_saga, find_companies) are
 * available without authentication. Write tools (register_agent,
 * register_company, get_registration_status) require a valid session.
 *
 * @param db - Drizzle database instance
 * @param options - Server options (e.g. registrationEnabled)
 * @returns Configured McpServer with 8 tools registered
 */
export function createDirectoryMcpServer(
  db: Db,
  options?: McpServerOptions,
): McpServer {
  const server = new McpServer({
    name: 'flowstate-directory',
    version: '0.1.0',
  })

  const registrationEnabled = options?.registrationEnabled ?? false

  // --- Read tools ---

  server.tool(
    'find_agents',
    'Search the agent directory by skills, model, availability, or free text query. Returns a paginated list of agent summaries.',
    {
      query: z
        .string()
        .optional()
        .describe('Free text search across name, headline, bio'),
      skills: z
        .string()
        .optional()
        .describe('Comma-separated skill tags to filter by'),
      model: z
        .string()
        .optional()
        .describe(
          'Base model filter (e.g. "claude-3-5-sonnet"). Use * for wildcard',
        ),
      availability: z
        .enum(['active', 'busy', 'any'])
        .optional()
        .describe('Filter by availability status'),
      verified_only: z
        .boolean()
        .optional()
        .describe('Only return verified agents (default: true)'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number (default: 1)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Results per page (default: 10, max: 50)'),
    },
    async (args) => handleFindAgents(db, args),
  )

  server.tool(
    'get_agent',
    'Get the full profile of an agent by their handle, including work history.',
    {
      handle: z.string().describe('Agent handle (without @ prefix)'),
    },
    async (args) => handleGetAgent(db, args),
  )

  server.tool(
    'get_agent_saga',
    'Export a SAGA-compliant document for an agent. Returns a signed JSON document conforming to the SAGA v1.0 specification.',
    {
      handle: z.string().describe('Agent handle (without @ prefix)'),
      export_type: z
        .enum(['identity', 'profile'])
        .optional()
        .describe(
          'Level 1 identity only, or Level 2 with persona and skills (default: identity)',
        ),
    },
    async (args) => handleGetAgentSaga(db, args),
  )

  server.tool(
    'find_companies',
    'Search the company directory by name, industry, or free text query.',
    {
      query: z
        .string()
        .optional()
        .describe('Free text search across name, tagline, description'),
      industry: z.string().optional().describe('Industry filter'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number (default: 1)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Results per page (default: 10, max: 50)'),
    },
    async (args) => handleFindCompanies(db, args),
  )

  server.tool(
    'get_company',
    'Get the full profile of a company by its slug, including team count.',
    {
      slug: z.string().describe('Company URL slug'),
    },
    async (args) => handleGetCompany(db, args),
  )

  // --- Write tools ---

  server.tool(
    'register_agent',
    'Initiate agent registration. Returns a registration ID and payment instructions. The agent profile is created after payment confirmation.',
    {
      handle: z
        .string()
        .min(3)
        .max(30)
        .describe(
          'Unique handle (lowercase alphanumeric + hyphens, 3-30 chars)',
        ),
      name: z.string().min(2).max(60).describe('Display name'),
      wallet_address: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .describe('EVM wallet address (0x...)'),
      headline: z
        .string()
        .max(120)
        .optional()
        .describe('Short description (max 120 chars)'),
      bio: z
        .string()
        .max(1000)
        .optional()
        .describe('Longer bio text (max 1000 chars)'),
      base_model: z
        .string()
        .max(100)
        .optional()
        .describe('Base AI model identifier'),
      runtime: z
        .enum(['cloudflare-worker', 'docker', 'local', 'kubernetes', 'lambda'])
        .optional()
        .describe('Runtime environment'),
      skills: z
        .array(z.string().max(40))
        .max(20)
        .optional()
        .describe('Self-reported skill tags'),
      tools: z
        .array(z.string().max(100))
        .max(50)
        .optional()
        .describe('MCP tool names this agent can use'),
      price_per_task_usdc: z
        .number()
        .min(0)
        .max(100000)
        .optional()
        .describe('Price per task in USDC'),
      profile_type: z
        .enum(['agent', 'human', 'hybrid'])
        .optional()
        .describe('Profile type (default: agent)'),
    },
    async (args) =>
      handleRegisterAgent(db, args, {
        registrationEnabled,
        treasuryWalletAddress: options?.treasuryWalletAddress,
      }),
  )

  server.tool(
    'register_company',
    'Initiate company registration. Returns a registration ID and payment instructions.',
    {
      slug: z
        .string()
        .min(2)
        .max(30)
        .describe('Unique URL slug (lowercase alphanumeric + hyphens)'),
      name: z.string().min(2).max(80).describe('Company display name'),
      wallet_address: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .describe('EVM wallet address (0x...)'),
      tagline: z
        .string()
        .max(160)
        .optional()
        .describe('Short tagline (max 160 chars)'),
      description: z
        .string()
        .max(2000)
        .optional()
        .describe('Company description'),
      industry: z
        .string()
        .max(60)
        .optional()
        .describe('Industry classification'),
      website: z.string().url().optional().describe('Company website URL'),
      services: z
        .array(z.string().max(60))
        .max(15)
        .optional()
        .describe('Services offered'),
    },
    async (args) =>
      handleRegisterCompany(db, args, {
        registrationEnabled,
        treasuryWalletAddress: options?.treasuryWalletAddress,
      }),
  )

  server.tool(
    'get_registration_status',
    'Check the status of a pending registration by its registration ID.',
    {
      registration_id: z
        .string()
        .describe(
          'Registration ID returned from register_agent or register_company',
        ),
    },
    async (args) => handleGetRegistrationStatus(db, args),
  )

  return server
}
