/**
 * Checks each judge finding's evidence against the text the judge was sent.
 *
 * ## Checks
 *
 * `norm` collapses whitespace and trims, keeping case. A quote counts only
 * when it is non-empty after `norm`:
 *
 * | evidenceSource    | verified when                                                        |
 * |-------------------|----------------------------------------------------------------------|
 * | `tool_result`     | the quote is in a tool result sent for the message the finding names |
 * | `earlier_message` | the quote is in a sent message with a lower index                    |
 * | `catalog`         | a `wrong_tool` names a catalog tool, or a `missing_capability` names none |
 * | `none`            | never: `misread_question` and `unneeded_refusal` get `not_applicable` |
 *
 * A tool result is matched leaf by leaf (strings as they are, numbers and
 * booleans as `String(v)`), so JSON's `\"` and `\n` escapes do not defeat a
 * quote, then as its whole sent text, for a quote that spans keys or a result
 * cut so it no longer parses. Matching uses `sentToolText`, the text as cut
 * for the prompt, so a quote from past an earlier turn's 2 KB cut fails.
 *
 * ## Special cases
 *
 * - A finding on a message outside the prompt's window is dropped and counted.
 * - A failed check keeps the finding, with its type, severity and claim, as
 *   `unverified`.
 * - Findings with the same type, tool and message (one fingerprint) merge:
 *   claims joined with " / ", the higher severity, and the evidence of the
 *   first one whose check did not fail (else the first one's).
 *
 * @module lib/judge/verify
 */

import { type JudgeMessage } from "@/lib/judge/build-prompt"
import { type JudgeOutput } from "@/lib/judge/schema"
import { type ChatTool } from "@/lib/llm/chat"

type Finding = JudgeOutput["findings"][number]
type EvidenceCheck = "verified" | "unverified" | "not_applicable"

export type VerifiedFinding = Finding & { messageId: string; evidenceCheck: EvidenceCheck }

type VerifyContext = {
  messages: JudgeMessage[]
  /** Every message index the prompt included. */
  window: Set<number>
  /** By message index, each tool result exactly as the judge was sent it. */
  sentToolText: Map<number, string[]>
  tools: ChatTool[]
}

const SEVERITY_RANK = { low: 0, medium: 1, high: 2 } as const
const NO_QUOTE_NEEDED = new Set<Finding["type"]>(["misread_question", "unneeded_refusal"])

const norm = (text: string) => text.replace(/\s+/g, " ").trim()

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (typeof value === "number" || typeof value === "boolean") return [String(value)]
  if (Array.isArray(value)) return value.flatMap(leaves)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(leaves)
  return []
}

function parsedLeaves(text: string): string[] {
  try {
    return leaves(JSON.parse(text))
  } catch {
    return []
  }
}

function inToolResult(quote: string, results: string[]): boolean {
  return results.some((text) => parsedLeaves(text).some((leaf) => norm(leaf).includes(quote)) || norm(text).includes(quote))
}

function check(finding: Finding, ctx: VerifyContext): EvidenceCheck {
  const quote = norm(finding.evidence)
  switch (finding.evidenceSource) {
    case "tool_result":
      return quote !== "" && inToolResult(quote, ctx.sentToolText.get(finding.messageIndex) ?? []) ? "verified" : "unverified"
    case "earlier_message": {
      const earlier = ctx.messages.filter((message) => message.index < finding.messageIndex && ctx.window.has(message.index))
      return quote !== "" && earlier.some((message) => norm(message.content).includes(quote)) ? "verified" : "unverified"
    }
    case "catalog": {
      const named = ctx.tools.some((tool) => tool.function.name === finding.tool)
      const ok = (finding.type === "wrong_tool" && named) || (finding.type === "missing_capability" && finding.tool === null)
      return ok ? "verified" : "unverified"
    }
    case "none":
      return NO_QUOTE_NEEDED.has(finding.type) ? "not_applicable" : "unverified"
  }
}

function merge(kept: VerifiedFinding, repeat: VerifiedFinding): VerifiedFinding {
  const base = kept.evidenceCheck === "unverified" && repeat.evidenceCheck !== "unverified" ? repeat : kept
  const severity = SEVERITY_RANK[repeat.severity] > SEVERITY_RANK[kept.severity] ? repeat.severity : kept.severity
  return { ...base, claim: `${kept.claim} / ${repeat.claim}`, severity }
}

export function verifyFindings(output: JudgeOutput, ctx: VerifyContext): { findings: VerifiedFinding[]; dropped: number; unverified: number } {
  const byIndex = new Map(ctx.messages.map((message) => [message.index, message]))
  const merged = new Map<string, VerifiedFinding>()
  let dropped = 0
  for (const finding of output.findings) {
    const message = ctx.window.has(finding.messageIndex) ? byIndex.get(finding.messageIndex) : undefined
    if (!message) {
      dropped += 1
      continue
    }
    const verified: VerifiedFinding = { ...finding, messageId: message.id, evidenceCheck: check(finding, ctx) }
    const key = JSON.stringify([finding.type, finding.tool ?? "", finding.messageIndex])
    const kept = merged.get(key)
    merged.set(key, kept ? merge(kept, verified) : verified)
  }
  const findings = [...merged.values()]
  return { findings, dropped, unverified: findings.filter((finding) => finding.evidenceCheck === "unverified").length }
}
