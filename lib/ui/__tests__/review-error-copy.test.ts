/**
 * The conversation review's failure copy: one fixed message per judge failure
 * code, a settings link where the admin can fix it, and a generic message for
 * anything else, so no provider text ever reaches the page. What blocks a
 * review now is said in the present tense; a failure, in the past.
 */

import { REVIEW_BLOCKED_COPY, reviewErrorCopy } from "@/lib/ui/review-error-copy"

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
    expect(fallback.link).toBeUndefined()
  })

  it("links the model, the switch and the budget to where each is set, and only them", () => {
    // In the past: the page can show the failure after the switch is back on or a model is set up. The links name
    // the AI provider section by its title
    expect(reviewErrorCopy("NOT_CONFIGURED")).toEqual({
      message: "No conversation review model was set up when this review ran.",
      link: { href: "/admin/settings#ai", label: "Set one up in AI provider settings, on the Conversation review tab" },
    })
    expect(reviewErrorCopy("LLM_DISABLED")).toEqual({
      message: "AI features were off when this review ran.",
      link: { href: "/admin/settings#ai", label: "Turn them on in AI provider settings" },
    })
    expect(reviewErrorCopy("BUDGET_EXCEEDED")).toEqual({
      message: "The Daily budget for conversation reviews is spent for today. Review again tomorrow.",
      link: { href: "/admin/settings#conversation-review", label: "Raise it in Conversation review settings" },
    })
    expect(CODES.filter((code) => reviewErrorCopy(code).link !== undefined)).toEqual(["NOT_CONFIGURED", "BUDGET_EXCEEDED", "LLM_DISABLED"])
  })

  it("ends each message before its link, and calls the cap the Daily budget", () => {
    for (const code of CODES) {
      const { message, link } = reviewErrorCopy(code)
      expect(message).toMatch(/\.$/)
      // The link carries its own words, so the message never repeats them
      if (link) expect(message).not.toContain(link.label)
      expect(message).not.toMatch(/spending cap|spend cap/i)
    }
    expect(reviewErrorCopy("BUDGET_UNAVAILABLE").message).toContain("Daily budget")
  })

  it("says in the present tense what blocks a review now, with the same link as its failure", () => {
    expect(REVIEW_BLOCKED_COPY).toEqual({
      LLM_DISABLED: { message: "AI features are turned off.", link: reviewErrorCopy("LLM_DISABLED").link },
      NOT_CONFIGURED: { message: "No conversation review model is set up.", link: reviewErrorCopy("NOT_CONFIGURED").link },
    })
  })

  it("never echoes the code or other text it was given", () => {
    expect(reviewErrorCopy("Provider said: 401 sk-live-abc").message).not.toContain("sk-live")
    expect(reviewErrorCopy("toString").message).toBe(reviewErrorCopy(null).message)
  })
})
