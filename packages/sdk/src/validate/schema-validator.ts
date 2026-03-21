// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SagaDocument } from '../types/saga-document'
import type { SagaValidationError, ValidationResult } from './errors'

function findSchemaPath(): string {
  // Walk up from this file to find the schema directory
  // Works whether running from src/ (dev) or dist/ (built)
  const candidates = [
    resolve(__dirname, '../../../../schema/v1/saga.schema.json'),
    resolve(__dirname, '../../../../../schema/v1/saga.schema.json'),
    resolve(__dirname, '../../schema/v1/saga.schema.json'),
    resolve(process.cwd(), 'schema/v1/saga.schema.json'),
  ]
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf-8')
      return candidate
    } catch {
      // continue
    }
  }
  throw new Error('Could not find saga.schema.json. Ensure the schema directory exists.')
}

function loadSchema(): Record<string, unknown> {
  const schemaPath = findSchemaPath()
  return JSON.parse(readFileSync(schemaPath, 'utf-8'))
}

let compiledValidate: ReturnType<Ajv['compile']> | null = null

function getCompiledValidator() {
  if (!compiledValidate) {
    const schema = loadSchema()
    const ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(ajv)
    compiledValidate = ajv.compile(schema)
  }
  return compiledValidate
}

/**
 * Validate a JSON object against the SAGA v1.0 JSON Schema.
 * Returns structured errors with JSON path context.
 */
export function validateSchema(doc: unknown): ValidationResult {
  const validate = getCompiledValidator()
  const valid = validate(doc)

  if (valid) {
    return { valid: true, warnings: [] }
  }

  const errors: SagaValidationError[] = (validate.errors ?? []).map(err => ({
    path: err.instancePath || '/',
    message: formatAjvError(err),
    severity: 'error' as const,
  }))

  return { valid: false, errors, warnings: [] }
}

/**
 * Validate and return a typed SagaDocument if valid.
 */
export function validateSagaDocument(
  doc: unknown
):
  | { valid: true; document: SagaDocument; warnings: SagaValidationError[] }
  | { valid: false; errors: SagaValidationError[]; warnings: SagaValidationError[] } {
  const result = validateSchema(doc)
  if (!result.valid) {
    return result
  }
  return { valid: true, document: doc as SagaDocument, warnings: result.warnings }
}

function formatAjvError(err: NonNullable<ReturnType<Ajv['compile']>['errors']>[number]): string {
  const path = err.instancePath || '/'
  switch (err.keyword) {
    case 'required':
      return `Missing required property '${(err.params as { missingProperty?: string })?.missingProperty}' at ${path}`
    case 'enum':
      return `Invalid value at ${path}. Allowed: ${(err.params as { allowedValues?: string[] })?.allowedValues?.join(', ')}`
    case 'pattern':
      return `Value at ${path} does not match pattern '${(err.params as { pattern?: string })?.pattern}'`
    case 'type':
      return `Expected ${(err.params as { type?: string })?.type} at ${path}`
    case 'additionalProperties':
      return `Unknown property '${(err.params as { additionalProperty?: string })?.additionalProperty}' at ${path}`
    case 'format':
      return `Invalid ${(err.params as { format?: string })?.format} format at ${path}`
    case 'const':
      return `Value at ${path} must be '${(err.params as { allowedValue?: string })?.allowedValue}'`
    default:
      return err.message ?? `Validation failed at ${path}`
  }
}
