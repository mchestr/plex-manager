/**
 * What a failed conversation review says, from its stored `errorCode`.
 *
 * The codes come from the judge call (`generateStructured`: `NOT_CONFIGURED`,
 * `TRUNCATED`, `CONTENT_FILTER`, `REFUSAL`, `SCHEMA`, `PROVIDER`, `ABORTED`),
 * the spend check (`BUDGET_EXCEEDED`, `BUDGET_UNAVAILABLE`), the processor
 * (`JOB_FAILED`, `PROMPT_TOO_LARGE`, and `LLM_DISABLED` while AI features
 * are off), the stuck-review reaper (`STALE`), enqueueing (`ENQUEUE_FAILED`)
 * and a conversation ending under a review (`ENDED`). The copy is fixed: a
 * review stores only a code, never provider text, and any other value reads
 * as the generic message. `lib/ui/error-copy.ts` is not used because its
 * `NOT_CONFIGURED` is Rewind copy.
 *
 * @module lib/ui/review-error-copy
 */

import type { Route } from "next"

import { settingsSection } from "@/lib/admin/routes"

/** A message that ends before its link, and the link's own words. */
type ReviewErrorCopy = { message: string; link?: { href: Route; label: string } }

const COPY: Record<string, ReviewErrorCopy> = {
  // The model is set on the AI provider section's Conversation review tab, which has no link of its own
  NOT_CONFIGURED: {
    message: "No conversation review model is set up.",
    link: { href: settingsSection("ai"), label: "Set one up in AI settings, on the Conversation review tab" },
  },
  TRUNCATED: { message: "The model ran out of room before it finished the review. Try again, or choose a model with a larger output limit." },
  CONTENT_FILTER: { message: "The provider's content filter stopped the review." },
  REFUSAL: { message: "The model declined to review this conversation." },
  SCHEMA: { message: "The model's answer was not in the expected format. Try again." },
  PROVIDER: { message: "The provider returned an error or could not be reached. Try again later." },
  ABORTED: { message: "The review took too long and was stopped. Try again." },
  BUDGET_EXCEEDED: {
    message: "The Daily budget for conversation reviews is spent for today. Review again tomorrow.",
    link: { href: settingsSection("conversation-review"), label: "Raise it in Conversation review settings" },
  },
  BUDGET_UNAVAILABLE: { message: "Today's spending against the Daily budget could not be checked, so the review did not run. Try again shortly." },
  STALE: { message: "The review stopped responding and was abandoned. Try again." },
  ENDED: { message: "The conversation ended before the review finished." },
  JOB_FAILED: { message: "The review job failed. Try again." },
  ENQUEUE_FAILED: { message: "The review could not be queued. Try again shortly." },
  LLM_DISABLED: { message: "AI features are turned off.", link: { href: settingsSection("ai"), label: "Turn them on in AI settings" } },
  PROMPT_TOO_LARGE: { message: "The newest turn, with the assistant's instructions and tools, is too long to fit in a review." },
}

const GENERIC: ReviewErrorCopy = { message: "The review failed. Try again." }

/** The fixed copy for a review's error code, with a link to the setting that fixes it where there is one. */
export function reviewErrorCopy(code: string | null): ReviewErrorCopy {
  return (code !== null && Object.hasOwn(COPY, code) ? COPY[code] : undefined) ?? GENERIC
}
