/**
 * The conversation review's failure copy: one fixed message per judge failure
 * code, a settings link where the admin can fix it, and a generic message for
 * anything else, so no provider text ever reaches the page.
 */

import { reviewErrorCopy } from "@/lib/ui/review-error-copy"

const CODES = [
  "NOT_CONFIGURED",
  "TRUNCATED",
  "CONTENT_FILTER",
  "REFUSAL",
  "SCHEMA",
  "PROVIDER",
  "ABORTED",
  "BUDGET_EXCEEDED",
  "BUDGET_UNAVAILABLE",
  "STALE",
  "ENDED",
  "JOB_FAILED",
  "ENQUEUE_FAILED",
  "LLM_DISABLED",
  "PROMPT_TOO_LARGE",
]

describe("reviewErrorCopy", () => {
  it("reviewErrorCopy covers every judge failure code and falls back for an unknown one", () => {
    const fallback = reviewErrorCopy("SOMETHING_NEW")
    const messages = CODES.map((code) => reviewErrorCopy(code).message)

    expect(new Set(messages).size).toBe(CODES.length)
    expect(messages).not.toContain(fallback.message)
    expect(reviewErrorCopy(null)).toEqual(fallback)
    expect(fallback.href).toBeUndefined()
  })

  it("links NOT_CONFIGURED and LLM_DISABLED, and only them, to the AI settings", () => {
    expect(reviewErrorCopy("NOT_CONFIGURED").href).toBe("/admin/settings#ai")
    expect(reviewErrorCopy("LLM_DISABLED")).toEqual({ message: "AI features are turned off. Turn them on to review conversations.", href: "/admin/settings#ai" })
    expect(CODES.filter((code) => reviewErrorCopy(code).href !== undefined)).toEqual(["NOT_CONFIGURED", "LLM_DISABLED"])
  })

  it("never echoes the code or other text it was given", () => {
    expect(reviewErrorCopy("Provider said: 401 sk-live-abc").message).not.toContain("sk-live")
    expect(reviewErrorCopy("toString").message).toBe(reviewErrorCopy(null).message)
  })
})
