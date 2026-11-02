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
 * {@link REVIEW_BLOCKED_COPY} says in the present tense what stops a review
 * from starting now: AI features are off, or no judge model is set up. A
 * review that failed with one of those codes says it in the past, since the
 * page can show it after the switch is back on or a model is set up, and the
 * page hides it while the same code still blocks the section.
 *
 * @module lib/ui/review-error-copy
 */

import type { Route } from "next"

import { settingsSection } from "@/lib/admin/routes"

/** A message that ends before its link, and the link's own words. */
export type ReviewErrorCopy = { message: string; link?: { href: Route; label: string } }

// Each link names the AI provider section by its title. The model is set on its Conversation review tab, which has
// no link of its own
const MODEL_LINK = { href: settingsSection("ai"), label: "Set one up in AI provider settings, on the Conversation review tab" }
const SWITCH_LINK = { href: settingsSection("ai"), label: "Turn them on in AI provider settings" }

const COPY: Record<string, ReviewErrorCopy> = {
  NOT_CONFIGURED: { message: "No conversation review model was set up when this review ran.", link: MODEL_LINK },
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
  LLM_DISABLED: { message: "AI features were off when this review ran.", link: SWITCH_LINK },
  PROMPT_TOO_LARGE: { message: "The newest turn, with the assistant's instructions and tools, is too long to fit in a review." },
}

const GENERIC: ReviewErrorCopy = { message: "The review failed. Try again." }

/** Why no review can start now, in the present tense; see the module comment. */
export const REVIEW_BLOCKED_COPY = {
  LLM_DISABLED: { message: "AI features are turned off.", link: SWITCH_LINK },
  NOT_CONFIGURED: { message: "No conversation review model is set up.", link: MODEL_LINK },
} satisfies Record<string, ReviewErrorCopy>

/** The fixed copy for a review's error code, with a link to the setting that fixes it where there is one. */
export function reviewErrorCopy(code: string | null): ReviewErrorCopy {
  return (code !== null && Object.hasOwn(COPY, code) ? COPY[code] : undefined) ?? GENERIC
}
