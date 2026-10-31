import "server-only"

/**
 * The fields of Tautulli's records the tools keep.
 *
 * Tautulli sends about 200 fields a stream and 45 a play, most of them
 * artwork, GUIDs, file paths, codec detail and addresses; an answer needs who,
 * what, when and how it played. Each projection is an allowlist, so no email,
 * IP address or token can reach the model, and a field that is empty or not
 * text, a number or a flag is left out rather than failing its record.
 *
 * Field names stay Tautulli's: the Discord allowlist of
 * `get_tautulli_activity` (`discordFields`) matches them, and the times
 * (`date`, `last_seen`, `last_play`) are still the ones `withLocalTimestamps`
 * converts.
 *
 * @module
 */

import { isRecord, listOf, pick, type Row } from "./plex-tautulli-reply"

/** A user: the id the other Tautulli tools take, the names, access, and last play and play counts when Tautulli sends them. */
const USER_FIELDS = ["user_id", "friendly_name", "username", "is_active", "is_admin", "is_home_user", "is_restricted", "last_seen", "plays", "duration"]

/** Flags a user row carries only when set, as most users have none of them. */
const SET_ONLY = new Set(["is_admin", "is_home_user", "is_restricted"])

const isSet = (value: Row[string] | undefined) => value === 1 || value === "1" || value === true

export function userOf(record: unknown): Row {
  return Object.fromEntries(Object.entries(pick(record, USER_FIELDS)).filter(([key, value]) => !SET_ONLY.has(key) || isSet(value)))
}

/** Whether a user still has access to the server; Tautulli keeps removed users as inactive. */
export const isActiveUser = (user: Row) => isSet(user.is_active)

/**
 * A stream: who (an admin's answer; the Discord allowlist drops them), what,
 * its progress, the player and where it plays from, its bandwidth (kbps), and
 * how it plays: the quality chosen, each transcode decision, the source and
 * streamed resolution, and whether the server transcodes in hardware.
 */
const SESSION_FIELDS = [
  "user_id", "friendly_name",
  "full_title", "title", "grandparent_title", "parent_title", "media_type", "year", "parent_media_index", "media_index", "library_name",
  "state", "progress_percent",
  "product", "platform", "player", "location", "bandwidth",
  "quality_profile", "transcode_decision", "video_decision", "audio_decision", "subtitle_decision",
  "container", "video_codec", "video_resolution", "stream_video_resolution", "audio_codec",
  "transcode_hw_decoding", "transcode_hw_encoding",
]

export const sessionOf = (record: unknown) => pick(record, SESSION_FIELDS)

/** The totals of `get_activity`: streams by decision, and bandwidth (kbps) in all, on the LAN and over the WAN. */
const ACTIVITY_TOTALS = [
  "stream_count", "stream_count_direct_play", "stream_count_direct_stream", "stream_count_transcode",
  "total_bandwidth", "lan_bandwidth", "wan_bandwidth",
]

export const activityTotalsOf = (data: unknown) => pick(data, ACTIVITY_TOTALS)

/** A play: when it started, who, what, seconds played and how far, and on what. */
const PLAY_FIELDS = [
  "date", "user_id", "friendly_name", "full_title", "media_type", "year", "parent_media_index", "media_index",
  "duration", "percent_complete", "watched_status", "platform", "player", "transcode_decision", "location",
]

export const playOf = (record: unknown) => pick(record, PLAY_FIELDS)

/** A `top_movies` or `top_tv` row: the title, its plays, seconds watched and last play. */
const TOP_TITLE_FIELDS = ["title", "year", "total_plays", "total_duration", "last_play"]

export const topTitleOf = (record: unknown) => pick(record, TOP_TITLE_FIELDS)

/** A `top_users` row: the user, their plays, seconds watched and last play. */
const TOP_USER_FIELDS = ["user_id", "friendly_name", "total_plays", "total_duration", "last_play"]

export const topUserOf = (record: unknown) => pick(record, TOP_USER_FIELDS)

/** The rows of a `get_home_stats` card (`{ stat_id, rows }`); anything else has none. */
export const homeStatRows = (data: unknown) => listOf(isRecord(data) ? data.rows : undefined)
