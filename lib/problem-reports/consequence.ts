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
 * | anything else       |                                       | `TO_ADMIN`         |
 *
 * @module lib/problem-reports/consequence
 */

import type { ProblemCode, ReportableType } from "@/lib/problem-reports/taxonomy"

/** What the send button does. */
export type SendAction = "LOOK_FOR_MISSING" | "BETTER_COPY" | "REFRESH" | "TO_ADMIN"

export interface SendContext {
  /** The title the report is about: an episode when one of a show's episodes is picked. */
  type: ReportableType
  /** The member's last play of it was converted by their Plex app. */
  transcoded: boolean
  radarr: boolean
  sonarr: boolean
}

const WORDS: Record<SendAction, { line: string; button: string }> = {
  LOOK_FOR_MISSING: { line: "We'll check which episodes are missing and look for them. Nothing is removed.", button: "Look for them" },
  BETTER_COPY: { line: "We'll look for a better copy. If there isn't one, nothing changes.", button: "Look for a better copy" },
  REFRESH: { line: "We'll check the details and ask Plex to read them again. The file stays the same.", button: "Fix the details" },
  TO_ADMIN: { line: "The server admin will take a look. We'll message you when it's done.", button: "Send to the server admin" },
}

/** After the playback tip, for a blurry picture the member's Plex app converted. */
const CONVERTED_LINE = "Still blurry with the quality set to Maximum? Send it to the server admin."

/** What the send button does. @internal */
export function sendAction(problem: ProblemCode | null, context: SendContext): SendAction {
  if (problem === "missing_episodes") return context.type !== "movie" && context.sonarr ? "LOOK_FOR_MISSING" : "TO_ADMIN"
  if (problem === "wrong_details") return (context.type === "movie" ? context.radarr : context.sonarr) ? "REFRESH" : "TO_ADMIN"
  if (problem !== "blurry" || context.transcoded) return "TO_ADMIN"
  const service = context.type === "movie" ? context.radarr : context.type === "episode" && context.sonarr
  return service ? "BETTER_COPY" : "TO_ADMIN"
}

/** The line and the button for sending `problem`; before one is chosen, the server admin's. */
export function consequence(problem: ProblemCode | null, context: SendContext): { action: SendAction; line: string; button: string } {
  const action = sendAction(problem, context)
  const words = WORDS[action]
  return { action, line: problem === "blurry" && context.transcoded ? CONVERTED_LINE : words.line, button: words.button }
}
