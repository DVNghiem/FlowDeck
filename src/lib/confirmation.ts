export interface ConfirmationResponse {
  success: boolean
  message: string
  status: "AWAITING_CONFIRM"
  confirm_mode: "y/n" | "multi-choice"
  operation: string
  choices?: string[]
  [key: string]: unknown
}

/**
 * Generate AWAITING_CONFIRM response for y/n prompt.
 * @param operation - Short identifier for the operation (e.g., "roadmap-complete")
 * @param message - User-facing prompt message
 */
export function confirmPrompt(operation: string, message: string): ConfirmationResponse {
  return {
    success: true,
    message,
    status: "AWAITING_CONFIRM",
    confirm_mode: "y/n",
    operation,
  }
}

/**
 * Generate AWAITING_CONFIRM response for multi-choice prompt.
 * @param operation - Short identifier for the operation
 * @param message - User-facing prompt message
 * @param choices - Array of choice strings (e.g., ["show conflict", "attempt resolution", "abort"])
 */
export function multiChoiceConfirm(operation: string, message: string, choices: string[]): ConfirmationResponse {
  return {
    success: true,
    message,
    status: "AWAITING_CONFIRM",
    confirm_mode: "multi-choice",
    operation,
    choices,
  }
}

/**
 * Generate skip response when user says "no".
 * @param operation - Short identifier for the operation
 */
export function skipResponse(operation: string): Record<string, unknown> {
  return {
    success: true,
    message: `${operation} skipped. No changes made.`,
    skipped: true,
    operation,
  }
}
