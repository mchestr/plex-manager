/**
 * What sending a report will do, said before the member sends it: the line
 * under the form and the words on its button, the same on the web and in
 * Discord (docs/problem-reports.md, "What the member sees").
 *
 * It reads what is known before anything is asked of Sonarr or Radarr: the
 * problem, the type of title, whether the member's last play of it was
 * converted by their Plex app, and which services are set up. The report
 * itself checks again when it is sent and may answer instead
 * (`lib/problem-reports/service.ts`), so a line here never promises more
 * than "we'll look".
 *
 * | Problem             | Title, and what's set up              | Send does          |
 * |---------------------|---------------------------------------|--------------------|
 * | Episodes are missing| a show or an episode, with Sonarr     | `LOOK_FOR_MISSING` |
 * | Blurry, not converted| a movie with Radarr, an episode with Sonarr | `BETTER_COPY` |
 * | Wrong title, poster or description | a movie with Radarr, a show or an episode with Sonarr | `REFRESH` |
 * | A swap problem (`./member-swap-words.ts`) | a movie with Radarr, an episode with Sonarr, and the gate's decision allows it | `SWAP` |
 * | A different title plays | a movie with Radarr, a show or an episode with Sonarr, with members' fixes on | `FIX_MATCH` |
 * | anything else       |                                       | `TO_ADMIN`         |
 *
 * A swap's line says it spends one of the member's swaps, with their
 * allowance under it (`note`); a swap the gate refuses goes to the server
 * admin with the reason. Both show only while members' swaps are On: in Dry
 * run and Off the member sees the server admin's line.
 *
 * @module lib/problem-reports/consequence
 */

import { allowanceWords, PLAYED_TO_END_WORDS, refusalWords, swapFits, swapLine, type SwapOffer } from "@/lib/problem-reports/member-swap-words"
import type { ProblemCode, ReportableType } from "@/lib/problem-reports/taxonomy"
import type { DeviceAnswer } from "@/lib/validations/problem-reports"

/** What the send button does. */
type SendAction = "LOOK_FOR_MISSING" | "BETTER_COPY" | "REFRESH" | "SWAP" | "FIX_MATCH" | "TO_ADMIN"

export interface SendContext {
  /** The title the report is about: an episode when one of a show's episodes is picked. */
  type: ReportableType
  /** The member's last play of it was converted by their Plex app. */
  transcoded: boolean
  radarr: boolean
  sonarr: boolean
  /** The answer to "Does anything else play on {player}?", once given. */
  device?: DeviceAnswer
  /** It played to the end for anyone since its file was added; `null` when Tautulli couldn't say. */
  playedToEnd?: boolean | null
  /** Members' swaps as the gate decides them now for this title; `null` unless they're On. */
  swap?: SwapOffer | null
  /** Members' fixes of the Plex match run on their own (members' swaps are On). */
  matchFixes?: boolean
}

const WORDS: Record<Exclude<SendAction, "SWAP">, { line: string; button: string }> = {
  LOOK_FOR_MISSING: { line: "We'll check which episodes are missing and look for them. Nothing is removed.", button: "Look for them" },
  BETTER_COPY: { line: "We'll look for a better copy. If there isn't one, nothing changes.", button: "Look for a better copy" },
  REFRESH: { line: "We'll check the details and ask Plex to read them again. The file stays the same.", button: "Fix the details" },
  FIX_MATCH: { line: "We'll fix the title and poster in Plex. The file stays the same.", button: "Fix the details" },
  TO_ADMIN: { line: "The server admin will take a look. We'll message you when it's done.", button: "Send to the server admin" },
}

/** What sending does, with the line under it: the allowance for a swap, or why it goes to the server admin. */
export interface Consequence {
  action: SendAction
  line: string
  button: string
  note: string | null
}

const toAdmin = (note: string | null): Consequence => ({ action: "TO_ADMIN", ...WORDS.TO_ADMIN, note })

/** A swap problem: a swap within the allowance, or the server admin with why. */
function swapConsequence(problem: ProblemCode, context: SendContext): Consequence {
  const fileService = context.type === "movie" ? context.radarr : context.type === "episode" && context.sonarr
  const offer = context.swap
  if (!fileService || !offer) return toAdmin(null)
  const fits = swapFits(problem, { device: context.device, playedToEnd: context.playedToEnd ?? null, transcoded: context.transcoded })
  if (fits === "PLAYED_TO_END") return toAdmin(PLAYED_TO_END_WORDS)
  if (fits !== "SWAP") return toAdmin(null)
  if (!offer.ok) return toAdmin(refusalWords(offer.reason, offer.until))
  return { action: "SWAP", line: swapLine(offer.of), button: "Swap the copy", note: allowanceWords(offer) }
}

/** After the playback tip, for a blurry picture the member's Plex app converted. */
const CONVERTED_LINE = "Still blurry with the quality set to Maximum? Send it to the server admin."

/** What the send button does, for the problems without a member's swap. @internal */
export function sendAction(problem: ProblemCode | null, context: SendContext): Exclude<SendAction, "SWAP"> {
  const titleService = context.type === "movie" ? context.radarr : context.sonarr
  if (problem === "missing_episodes") return context.type !== "movie" && context.sonarr ? "LOOK_FOR_MISSING" : "TO_ADMIN"
  if (problem === "wrong_details") return titleService ? "REFRESH" : "TO_ADMIN"
  if (problem === "different_title") return titleService && context.matchFixes ? "FIX_MATCH" : "TO_ADMIN"
  if (problem !== "blurry" || context.transcoded) return "TO_ADMIN"
  const service = context.type === "movie" ? context.radarr : context.type === "episode" && context.sonarr
  return service ? "BETTER_COPY" : "TO_ADMIN"
}

/** The line, the button and the note for sending `problem`; before one is chosen, the server admin's. */
export function consequence(problem: ProblemCode | null, context: SendContext): Consequence {
  if (problem && swapFits(problem, { playedToEnd: null, transcoded: false }) !== "NOT_A_SWAP") return swapConsequence(problem, context)
  const action = sendAction(problem, context)
  const words = WORDS[action]
  return { action, line: problem === "blurry" && context.transcoded ? CONVERTED_LINE : words.line, button: words.button, note: null }
}
