/**
 * What a failed conversation review says, from its stored `errorCode`.
 *
 * The codes come from the judge call (`generateStructured`: `NOT_CONFIGURED`,
 * `TRUNCATED`, `CONTENT_FILTER`, `REFUSAL`, `SCHEMA`, `PROVIDER`, `ABORTED`),
 * the spend check (`BUDGET_EXCEEDED`, `BUDGET_UNAVAILABLE`), the processor
 * (`JOB_FAILED`, `PROMPT_TOO_LARGE`, and `LLM_DISABLED` while AI features are
 * off), the stuck-review reaper (`STALE`), enqueueing
 * (`ENQUEUE_FAILED`) and a conversation ending under a review (`ENDED`). The
 * copy is fixed: a review stores only a code, never provider text, and any
 * other value reads as the generic message. `lib/ui/error-copy.ts` is not
 * used because its `NOT_CONFIGURED` is Rewind copy.
 *
 * @module lib/ui/review-error-copy
 */

import type { Route } from "next"

import { settingsSection } from "@/lib/admin/routes"

type ReviewErrorCopy = { message: string; href?: Route }

const COPY: Record<string, ReviewErrorCopy> = {
  NOT_CONFIGURED: { message: "No conversation review model is set up. Add one in the AI settings.", href: settingsSection("ai") },
  TRUNCATED: { message: "The model ran out of room before it finished the review. Try again, or choose a model with a larger output limit." },
  CONTENT_FILTER: { message: "The provider's content filter stopped the review." },
  REFUSAL: { message: "The model declined to review this conversation." },
  SCHEMA: { message: "The model's answer was not in the expected format. Try again." },
  PROVIDER: { message: "The provider returned an error or could not be reached. Try again later." },
  ABORTED: { message: "The review took too long and was stopped. Try again." },
  BUDGET_EXCEEDED: { message: "Today's conversation review spending cap is reached. Raise it in settings, or review again tomorrow." },
  BUDGET_UNAVAILABLE: { message: "Today's review spending could not be checked, so the review did not run. Try again shortly." },
  STALE: { message: "The review stopped responding and was abandoned. Try again." },
  ENDED: { message: "The conversation ended before the review finished." },
  JOB_FAILED: { message: "The review job failed. Try again." },
  ENQUEUE_FAILED: { message: "The review could not be queued. Try again shortly." },
  LLM_DISABLED: { message: "AI features are turned off. Turn them on to review conversations.", href: settingsSection("ai") },
  PROMPT_TOO_LARGE: { message: "The newest turn, with the assistant's instructions and tools, is too long to fit in a review." },
}

const GENERIC: ReviewErrorCopy = { message: "The review failed. Try again." }

/** The fixed copy for a review's error code, with a settings link where the admin can fix it. */
export function reviewErrorCopy(code: string | null): ReviewErrorCopy {
  return (code !== null && Object.hasOwn(COPY, code) ? COPY[code] : undefined) ?? GENERIC
}
