import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"

/**
 * A generation failure with its stored code. `retryable` failures (an
 * upstream or provider error) are thrown back to BullMQ for another attempt;
 * the rest end the run at once.
 */
export class RewindGenerationError extends Error {
  readonly code: RewindErrorCode
  readonly retryable: boolean

  constructor(code: RewindErrorCode, { retryable }: { retryable: boolean }) {
    super(`Rewind generation failed: ${code}`)
    this.name = "RewindGenerationError"
    this.code = code
    this.retryable = retryable
  }
}
