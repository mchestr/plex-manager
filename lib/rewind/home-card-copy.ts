/**
 * The home RewindCard's words (ui-design-system 5.5). Failures read from a
 * code map, never the stored message, and no line offers to generate.
 *
 * @module lib/rewind/home-card-copy
 */

import type { RewindCardState } from "@/lib/rewind/home-card-state"
import { rewindInfraMessage } from "@/lib/rewind/infra-copy"
import { formatCount, formatRunningTime } from "@/lib/rewind/format"
import { formatDate, type FormatSettings } from "@/lib/utils/format"
import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"

export interface CardCopy {
  title: string
  lead: string
  /** A short status label above the title, for the states that are not ready. */
  badge: string | null
}

const ADMIN_CAN_SEE = "The server admin can see what happened."

const FAILURE_LEADS: Partial<Record<RewindErrorCode, string>> = {
  TIMEOUT: "It took too long to finish.",
  UPSTREAM_ERROR: "The watch history service didn't answer.",
  LLM_FAILED: "The words for your pages couldn't be written.",
  NOT_CONFIGURED: "Rewind isn't fully set up on this server yet.",
  TAUTULLI_USER_NOT_FOUND: "Your account wasn't found in the server's watch history.",
}

/** The failed state's lead for `code`. @internal */
export function failureLead(code: RewindErrorCode): string {
  const reason = FAILURE_LEADS[code]
  return reason ? `${reason} ${ADMIN_CAN_SEE}` : ADMIN_CAN_SEE
}

/** "18 pages, about 2 min 20 s": the cover's cut-button string (Rewind 4.3). */
export function issueMeta(pages: number, readMs: number, { locale }: Pick<FormatSettings, "locale">): string {
  return `${formatCount(pages, { one: "page", other: "pages" }, { locale })}, about ${formatRunningTime(readMs)}`
}

/** The lock or globe line under a ready Rewind (FR-36). */
export function shareLine(state: Extract<RewindCardState, { kind: "ready" }>, settings: FormatSettings): string {
  if (state.share.state === "off") return "Private. Server admins can view it."
  if (!state.share.expiresOn) return "Public link on"
  return `Public link on until ${formatDate(state.share.expiresOn, "short", settings)}`
}

/** The day before `opensOn`: the last day the season's data window counts. */
function lastCountedDay(opensOn: Date): Date {
  return new Date(opensOn.getTime() - 1000)
}

/**
 * The title, lead and badge for a state. `name` is `rewindName(year)` for
 * the ready title ("Your Northfield Plex Rewind 2026 is ready").
 */
export function cardCopy(state: RewindCardState, name: string, settings: FormatSettings): CardCopy {
  switch (state.kind) {
    case "ready":
      return {
        title: `Your ${name} is ready`,
        lead:
          state.edition === "postcard"
            ? "A postcard from your year on the server."
            : "Your year on the server, set as an issue to page through.",
        badge: null,
      }
    case "generating":
      return { title: "Setting your pages", lead: "Usually a minute or two. You can leave this page; it keeps going.", badge: "Generating" }
    case "failed":
      return { title: "Your Rewind couldn't be finished", lead: failureLead(state.code), badge: "Couldn't finish" }
    case "before-season":
      return {
        title: `Your Rewind arrives on ${formatDate(state.opensOn, "day-month", settings)}`,
        lead: `Everything you watch until ${formatDate(lastCountedDay(state.opensOn), "day-month", settings)} counts.`,
        badge: `Opens ${formatDate(state.opensOn, "day-month-short", settings)}`,
      }
    case "not-eligible":
      return state.reason === "jellyfin-only"
        ? { title: "Rewind needs Plex watch history", lead: "Jellyfin support is planned.", badge: "Not eligible yet" }
        : {
            title: "Your first Rewind arrives next year",
            lead: "Rewind needs a few months of watching, so this year's season starts without you.",
            badge: "Not eligible yet",
          }
    case "closed":
      return {
        title: `Rewind ${state.year} is still yours`,
        lead: `The season closed on ${formatDate(lastCountedDay(state.closedOn), "day-month", settings)}. Open it any time.`,
        badge: null,
      }
    case "not-started":
      return { title: `Your Rewind ${state.year} is on its way`, lead: "The server sets every issue this month. Check back soon.", badge: null }
    case "unavailable":
      if (state.code === "REDIS_UNAVAILABLE") {
        return { title: "Rewind is temporarily unavailable", lead: "Try again in a few minutes.", badge: null }
      }
      return {
        title: rewindInfraMessage(state.code, "member"),
        lead: state.viewerIsAdmin ? rewindInfraMessage(state.code, "admin") : "Ask the server admin when it's coming.",
        badge: null,
      }
  }
}
