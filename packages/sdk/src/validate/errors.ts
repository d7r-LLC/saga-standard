// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** Severity of a validation finding */
export type ValidationSeverity = 'error' | 'warning'

/** A single validation error or warning with path context */
export interface SagaValidationError {
  path: string
  message: string
  severity: ValidationSeverity
}

/** Result of validating a SAGA document */
export type ValidationResult =
  | { valid: true; warnings: SagaValidationError[] }
  | { valid: false; errors: SagaValidationError[]; warnings: SagaValidationError[] }
