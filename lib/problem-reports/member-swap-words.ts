/**
 * A member's swap of the copy as the sheet and Discord put it
 * (docs/problem-reports.md, "Members' swaps"): whether what the member
 * described is a problem a swap fixes, and the words for the swap, their
 * allowance and each refusal. Pure, so the sheet, Discord and the report all
 * read the same rules.
 *
 * | Problem                              | Swaps when                                        |
 * |--------------------------------------|---------------------------------------------------|
 * | won't start, stops, glitches, out of sync, no sound | other titles play on the member's player, and the copy hasn't played to the end since it was added; glitches on a converted play get the tips first |
 * | filmed off a screen, stuck subtitles | always: it's in the copy                          |
 *
 * @module lib/problem-reports/member-swap-words
 */

import type { Allowance, SwapRefusal } from "@/lib/problem-reports/gate"
import { asksDevice, PROBLEMS, type ProblemCode } from "@/lib/problem-reports/taxonomy"
import type { DeviceAnswer } from "@/lib/validations/problem-reports"

/** The gate's decision as the sheet and Discord show it, with its dates already in words ("Nov 10"). */
export type SwapOffer = { ok: true; left: number; of: number; nextBack: string | null } | { ok: false; reason: SwapRefusal; until: string | null }

/** What the member said about how it played, and what Tautulli says. */
export interface PlayFacts {
  /** The answer to "Does anything else play on {player}?", when it was asked. */
  device?: DeviceAnswer
  playedToEnd: boolean | null
  transcoded: boolean
}

/** Whether a swap fixes the problem: it does, the sheet's tips come first, the copy has played to the end, or it's no swap problem. */
export function swapFits(problem: ProblemCode, facts: PlayFacts): "SWAP" | "TIPS" | "PLAYED_TO_END" | "NOT_A_SWAP" {
  if (PROBLEMS[problem].fix !== "SWAP") return "NOT_A_SWAP"
  if (!asksDevice(problem)) return "SWAP"
  if (facts.device !== "others_play" || (problem === "glitches" && facts.transcoded)) return "TIPS"
  return facts.playedToEnd === true ? "PLAYED_TO_END" : "SWAP"
}

/** The line for a swap, which spends one of the member's swaps. */
export const swapLine = (of: number) =>
  `We'll find a different copy and swap it in. The one you have keeps playing until the new one is ready, which can take a few minutes to a day. Uses 1 of your ${of} swaps.`

/** The member's allowance, shown where a swap is spent. */
export function allowanceWords({ left, of, nextBack }: Omit<Allowance, "nextBack"> & { nextBack: string | null }): string {
  if (left === 1 && nextBack) return `This is your last swap until ${nextBack}.`
  const count = `${left} of ${of} ${of === 1 ? "swap" : "swaps"} left.`
  return nextBack ? `${count} One comes back ${nextBack}.` : count
}

const REFUSALS: Record<SwapRefusal, string | null> = {
  OFF: null,
  PAUSED: "Automatic swaps are paused right now.",
  NEEDS_APPROVAL: "The server admin checks swaps for your account first.",
  NOT_PLAYED: "We can only swap titles you've played recently.",
  TITLE_RECENT: "This title was swapped recently.",
  OUT_OF_SWAPS: null,
}

/** Why a swap goes to the server admin instead, under the line that says so; none while automatic swaps are off. */
export function refusalWords(reason: SwapRefusal, until: string | null): string | null {
  if (reason === "OUT_OF_SWAPS") return until ? `You're out of swaps until ${until}.` : "You're out of swaps for now."
  return REFUSALS[reason]
}

/** Why a copy that played to the end goes to the server admin. */
export const PLAYED_TO_END_WORDS = "It has played to the end since it was added, so it may be your device or connection."
