/**
 * The member shell's one notice slot (ui-design-system 6.1): which notice
 * wins, and where it is not shown. Pure, so the client slot can apply the
 * page rule; `lib/member/notice.ts` gathers the candidates on the server.
 *
 * @module lib/member/notice-rules
 */

export type MemberNotice =
  | { kind: "past-due" }
  /** `jellyfinEnabled`: a member with both services, whose Jellyfin account is already on (P11.11). */
  | { kind: "pending-invite"; jellyfinEnabled?: true }
  | { kind: "outage"; serviceName: string }
  | { kind: "rewind-ready"; year: number; finalCut?: true }

/** Highest first. P7.14 produces `rewind-ready`. */
const PRIORITY: ReadonlyArray<MemberNotice["kind"]> = ["past-due", "pending-invite", "outage", "rewind-ready"]

/** The one notice to show of every candidate, or `null`. */
export function pickNotice(candidates: ReadonlyArray<MemberNotice | null>): MemberNotice | null {
  let best: MemberNotice | null = null
  for (const candidate of candidates) {
    if (candidate && (!best || PRIORITY.indexOf(candidate.kind) < PRIORITY.indexOf(best.kind))) best = candidate
  }
  return best
}

/**
 * Whether `notice` shows on `pathname`. Home hides the Rewind notice, because
 * its RewindCard's ready state is first in reading order there.
 */
export function noticeShownOn(notice: MemberNotice, pathname: string): boolean {
  return !(notice.kind === "rewind-ready" && pathname === "/")
}
