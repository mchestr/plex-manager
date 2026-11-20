/**
 * The member side of media cleanup (UX 12.7, TS 13.3): the Leaving soon page,
 * the Home row and the Account Keeps. Only titles in libraries shared with the
 * member. No size (`ItemRef.sizeBytes` is null), no rule name, no other member.
 * Types only, client-safe.
 *
 * @module lib/cleanup/types/member
 */

import type { ItemRef } from "@/lib/cleanup/types/preview"

/** Why a title is under For you, first that applies (UX 9.2.3). */
export type MemberReason = "requested" | "started" | "played" | "watchlist"

/** A leave day, or "due" for "Leaves any day now". */
export type MemberLeaveAt = string | "due"

export interface ForYouItem {
  item: ItemRef
  reason: MemberReason
  reasonAt: string
  leaveAt: MemberLeaveAt
  kept: boolean
}

export interface MemberLeavingGroup {
  date: MemberLeaveAt
  count: number
  items: { item: ItemRef; leaveAt: MemberLeaveAt; kept: boolean }[]
}

/** One of the member's own Keeps: active, or ended in the last 30 days. Expired Keeps are not listed. */
export interface MyKeepRow {
  id: string
  item: ItemRef
  until: string
  keptAt: string
  endedAt?: string
  endedBy?: "self" | "admin"
}

/** `getLeavingSoonForMember(userId)`. `plexFailed`: plex.tv did not answer, so the page shows the alert, not the empty state. */
export interface MemberLeavingSoonData {
  enabled: boolean
  plexFailed: boolean
  keeps: { enabled: boolean; limit: number; used: number; days: number }
  forYou: ForYouItem[]
  groups: MemberLeavingGroup[]
  myKeeps: MyKeepRow[]
}

/** `getLeavingSoonRow(userId)`: the Home row, up to 12 items, For you first. */
export interface LeavingSoonRowData {
  items: { item: ItemRef; leaveAt: MemberLeaveAt; kept: boolean; forYou: boolean }[]
  total: number
  forYouCount: number
}
