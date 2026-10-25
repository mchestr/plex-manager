/**
 * The status vocabulary (ui-design-system 5.6): one word, one tone and one
 * mark per domain state, for `StatusBadge`, `StatusDot`, the settings nav
 * glyphs and the command menu.
 *
 * ## Entries
 *
 * Each `STATUS[domain][value]` is `{ label, tone, mark?, sub? }`:
 * - `tone` picks the badge colour; `plain` is text, never a badge.
 * - `mark` is `"dot"`, `"spinner"` or a lucide icon. Every warning carries
 *   `triangle-alert` (3.1) unless the table names another mark.
 * - `label` and `sub` may hold placeholders, which `resolveStatus` fills:
 *   `{date}` ("Nov 6, 2026"), `{day}` ("Oct 20"), `{ago}` ("2 minutes ago"),
 *   `{time}` ("Oct 20, 2026, 2:14 PM CST"), `{by}`, `{left}` and `{total}`.
 *
 * ## Special cases
 *
 * - A sub-line with a placeholder that has no value is left out, so a badge
 *   never prints "Renews {date}".
 * - In a label, an unfilled placeholder is dropped with the space before it
 *   ("Opens Dec 1" without a date is "Opens").
 *
 * @example
 * ```ts
 * resolveStatus("subscription", "ACTIVE", { date: new Date("2026-11-06T12:00:00Z") })
 * // { label: "Active", tone: "success", mark: "dot", sub: "Renews Nov 6, 2026" }
 * resolveStatus("connection", "untested").sub   // "Test after saving"
 * settingsCategory("degraded").label            // "Needs attention"
 * ```
 *
 * @module lib/ui/status
 */

import type { LucideIcon } from "lucide-react"

import { icons } from "@/lib/ui/icons"
import { formatDate, formatDateTime, formatRelative, type DateInput, type FormatSettings } from "@/lib/utils/format"

/** How a state reads: a status colour, a neutral or outline badge, or plain text. */
export type Tone = "success" | "warning" | "info" | "destructive" | "neutral" | "outline" | "plain"

/** What sits before the word: a dot, a spinner, or an icon. */
export type StatusMark = "dot" | "spinner" | LucideIcon

interface StatusEntry {
  label: string
  tone: Tone
  mark?: StatusMark
  sub?: string
}

const warning = { tone: "warning", mark: icons.warning } as const

export const STATUS = {
  subscription: {
    ACTIVE: { label: "Active", tone: "success", mark: "dot", sub: "Renews {date}" },
    PAST_DUE: { label: "Past due", ...warning, sub: "Retrying {day}" },
    UNPAID: { label: "Past due", ...warning, sub: "Retrying {day}" },
    CANCELED: { label: "Canceled", tone: "destructive", mark: icons.error, sub: "Ended {date}" },
    INCOMPLETE: { label: "Incomplete", tone: "neutral" },
    none: { label: "None", tone: "plain" },
  },
  exemption: {
    comp: { label: "Comp", tone: "info", sub: "Set by {by}" },
    exempt: { label: "Exempt", tone: "neutral", sub: "Set by {by}" },
    grandfathered: { label: "Grandfathered", tone: "plain" },
    notRequired: { label: "Not required", tone: "plain" },
  },
  plexAccess: {
    shared: { label: "Shared", tone: "success", mark: "dot" },
    notShared: { label: "Not shared", tone: "outline", mark: "dot" },
    unknown: { label: "Unknown", tone: "warning", mark: "dot", sub: "Last checked {ago}" },
  },
  role: {
    owner: { label: "Owner", tone: "outline", mark: icons.owner },
    admin: { label: "Admin", tone: "outline" },
    user: { label: "Member", tone: "plain" },
  },
  rewind: {
    ready: { label: "Ready to watch", tone: "success", mark: "dot", sub: "Generated {day}" },
    generating: { label: "Generating", tone: "info", mark: "spinner" },
    failed: { label: "Couldn't finish", tone: "destructive", mark: icons.error, sub: "Failed {day}" },
    opens: { label: "Opens {day}", tone: "neutral", mark: icons.scheduled },
    notStarted: { label: "Not started", tone: "plain" },
    notEligible: { label: "Not eligible yet", tone: "plain" },
  },
  connection: {
    ok: { label: "Connected", tone: "success", mark: "dot", sub: "Checked {ago}" },
    unreachable: { label: "Can't connect", tone: "destructive", mark: icons.error, sub: "Checked {ago}" },
    incomplete: { label: "Needs setup", ...warning },
    untested: { label: "Not checked", tone: "neutral", sub: "Test after saving" },
    disabled: { label: "Off", tone: "neutral" },
    notConfigured: { label: "Not set up", tone: "outline" },
    degraded: { label: "Template copy", ...warning, sub: "Rewind uses template copy while AI is off" },
  },
  queueJob: {
    active: { label: "Running", tone: "info", mark: "spinner" },
    waiting: { label: "Waiting", tone: "neutral" },
    completed: { label: "Done", tone: "success", mark: icons.done },
    failed: { label: "Failed", tone: "destructive" },
    delayed: { label: "Paused", tone: "warning", mark: icons.paused },
    paused: { label: "Paused", tone: "warning", mark: icons.paused },
  },
  worker: {
    running: { label: "Worker running", tone: "success", mark: "dot", sub: "Updated {ago}" },
    stopped: { label: "Worker stopped", tone: "destructive", mark: "dot", sub: "Updated {ago}" },
  },
  // The queues page's status row (P10.3)
  redis: {
    connected: { label: "Redis connected", tone: "success", mark: "dot" },
    unreachable: { label: "Redis unreachable", tone: "destructive", mark: "dot" },
  },
  queue: {
    running: { label: "Queue running", tone: "success", mark: "dot" },
    paused: { label: "Queue paused", tone: "warning", mark: icons.paused },
    unknown: { label: "Queue state unknown", tone: "neutral", mark: "dot" },
  },
  invite: {
    active: { label: "Active", tone: "success", mark: "dot", sub: "{left} of {total} uses left" },
    expired: { label: "Expired", tone: "neutral" },
    usedUp: { label: "Used up", tone: "neutral" },
    revoked: { label: "Revoked", tone: "neutral" },
  },
  share: {
    active: { label: "Active", tone: "success", mark: "dot" },
    expired: { label: "Expired", tone: "neutral" },
    stopped: { label: "Stopped", tone: "neutral" },
  },
  request: {
    pending: { label: "Waiting for approval", tone: "neutral" },
    approved: { label: "Requested", tone: "info", mark: icons.pending },
    processing: { label: "Requested", tone: "info", mark: icons.pending },
    available: { label: "Available", tone: "success", mark: icons.done },
    declined: { label: "Declined", tone: "destructive" },
  },
  prompt: {
    inUse: { label: "In use", tone: "success", mark: "dot" },
    notInUse: { label: "Not in use", tone: "neutral" },
    v2: { label: "v2, not used", tone: "outline" },
  },
  // The announcements admin table (P10.5)
  announcement: {
    active: { label: "Active", tone: "success", mark: "dot" },
    hidden: { label: "Hidden", tone: "neutral" },
    expired: { label: "Expired", tone: "destructive" },
  },
  // The Discord page's two status rows (P10.5), from `discordStatus`
  linkedRoles: {
    on: { label: "On", tone: "success", mark: "dot" },
    needsSetup: { label: "Needs setup", ...warning, sub: "Add the client ID and secret in settings" },
    off: { label: "Off", tone: "neutral", mark: "dot" },
  },
  supportBot: {
    online: { label: "Online", tone: "success", mark: "dot", sub: "Lease renewed {ago}" },
    offline: { label: "Offline", tone: "destructive", mark: "dot", sub: "Since {time}" },
    needsSetup: { label: "Waiting for a bot token", ...warning, sub: "Add the bot token in settings" },
    off: { label: "Turned off", tone: "neutral", mark: "dot" },
    loginRejected: { label: "Login rejected", tone: "destructive", mark: "dot", sub: "Discord refused the token or intents. Save a new bot token" },
    loginRetrying: { label: "Retrying login", ...warning, sub: "Login failed. Retrying with a growing delay" },
    loginCapped: { label: "Login limit reached", tone: "destructive", mark: "dot", sub: "Too many logins in 24 hours. Waiting before the next" },
  },
  discordCommand: {
    SUCCESS: { label: "Succeeded", tone: "success", mark: "dot" },
    FAILED: { label: "Failed", tone: "destructive" },
    PENDING: { label: "Running", tone: "info", mark: "spinner" },
    TIMEOUT: { label: "Timed out", ...warning },
  },
} as const satisfies Record<string, Record<string, StatusEntry>>

export type StatusDomain = keyof typeof STATUS
export type StatusValue<D extends StatusDomain> = keyof (typeof STATUS)[D] & string

/** A settings section's live health (5.6 "Connection"). */
export type ConnectionStatus = StatusValue<"connection">

/** The values a sub-line or label can be filled with. */
export interface StatusFill {
  /** The state's date: `{date}`, `{day}`, and `{ago}` with `now`. */
  date?: DateInput
  now?: DateInput
  by?: string
  usesLeft?: number
  usesTotal?: number
  /** The app zone and locale; UTC and en-US when left out, as outside `FormatProvider`. */
  settings?: FormatSettings
}

export interface ResolvedStatus {
  label: string
  tone: Tone
  mark?: StatusMark
  sub?: string
}

const DEFAULT_SETTINGS: FormatSettings = { timeZone: "UTC", locale: "en-US" }

function placeholders(fill: StatusFill): Record<string, string | undefined> {
  const settings = fill.settings ?? DEFAULT_SETTINGS
  const { date, now } = fill
  return {
    date: date === undefined ? undefined : formatDate(date, "short", settings),
    day: date === undefined ? undefined : formatDate(date, "day-month-short", settings),
    ago: date === undefined || now === undefined ? undefined : formatRelative(date, { ...settings, now }),
    time: date === undefined ? undefined : formatDateTime(date, settings, { zoneLabel: true }),
    by: fill.by,
    left: fill.usesLeft?.toString(),
    total: fill.usesTotal?.toString(),
  }
}

const PLACEHOLDER = /\{(\w+)\}/g

/** The sub-line with its placeholders filled, or undefined when one has no value. */
function fillSub(template: string, values: Record<string, string | undefined>): string | undefined {
  const keys = Array.from(template.matchAll(PLACEHOLDER), ([, key]) => key)
  if (keys.some((key) => values[key] === undefined)) return undefined
  return template.replace(PLACEHOLDER, (_, key: string) => values[key] ?? "")
}

/** The label with its placeholders filled; an unfilled one goes with the space before it. */
function fillLabel(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/ ?\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? "" : match.replace(`{${key}}`, value)
  })
}

/** The word, tone, mark and filled sub-line for one domain state. */
export function resolveStatus<D extends StatusDomain>(domain: D, value: StatusValue<D>, fill: StatusFill = {}): ResolvedStatus {
  const table: Record<StatusDomain, Record<string, StatusEntry>> = STATUS
  const entry = table[domain][value]
  const values = placeholders(fill)
  return {
    label: fillLabel(entry.label, values),
    tone: entry.tone,
    ...(entry.mark ? { mark: entry.mark } : {}),
    ...(entry.sub ? { sub: fillSub(entry.sub, values) } : {}),
  }
}

type SettingsCategory = "working" | "attention" | "broken" | "off"

const CATEGORIES = {
  working: { label: "Working", tone: "success", icon: icons.success },
  attention: { label: "Needs attention", tone: "warning", icon: icons.warning },
  broken: { label: "Not working", tone: "destructive", icon: icons.error },
  off: { label: "Off, not set up or not checked", tone: "neutral", icon: icons.notChecked },
} as const satisfies Record<SettingsCategory, { label: string; tone: Tone; icon: LucideIcon }>

const CATEGORY_OF = {
  ok: "working",
  degraded: "attention",
  incomplete: "attention",
  unreachable: "broken",
  untested: "off",
  disabled: "off",
  notConfigured: "off",
} as const satisfies Record<ConnectionStatus, SettingsCategory>

/**
 * The settings nav glyph for a connection state (5.6): a shape per category,
 * so the four differ without colour. `neutral` renders in `muted-foreground`.
 * A dirty section keeps its category and adds the unsaved-changes pip.
 */
export function settingsCategory(status: ConnectionStatus) {
  const category = CATEGORY_OF[status]
  return { category, ...CATEGORIES[category] }
}

/** A `discord-bot` lease (`LeaseLock`) renewed within this long counts as a live bot (a lease lasts 30 s). */
const DISCORD_HEARTBEAT_MS = 90_000

export interface DiscordState {
  /** `DiscordIntegration.isEnabled`: linked roles and account linking. */
  isEnabled: boolean
  /** A client ID and secret are saved. */
  hasClientCredentials: boolean
  /** `DiscordIntegration.botEnabled`: the support bot. */
  botEnabled: boolean
  hasBotToken: boolean
  /** The bot lease's last renewal, or null when no instance ever held it. */
  lastRenewedAt: Date | null
  /** Why the login guard is holding the bot back, if it is. */
  loginBlock?: "fatal" | "backoff" | "daily_cap" | null
}

/**
 * The Discord page's two rows (P10.5, UI-08): "Linked roles" from the enabled
 * flag and the OAuth credentials, and "Support bot" from `botEnabled`, the
 * token and a lease heartbeat within {@link DISCORD_HEARTBEAT_MS}. Each row
 * reads on its own, so a stopped bot never turns linked roles off.
 */
export function discordStatus(state: DiscordState, now: Date, settings?: FormatSettings) {
  const linkedRoles = !state.isEnabled ? "off" : state.hasClientCredentials ? "on" : "needsSetup"
  const live = state.lastRenewedAt !== null && now.getTime() - state.lastRenewedAt.getTime() <= DISCORD_HEARTBEAT_MS
  const blocked = { fatal: "loginRejected", backoff: "loginRetrying", daily_cap: "loginCapped" } as const
  const supportBot = !state.botEnabled
    ? "off"
    : !state.hasBotToken
      ? "needsSetup"
      : state.loginBlock
        ? blocked[state.loginBlock]
        : live
          ? "online"
          : "offline"
  const fill = { date: state.lastRenewedAt ?? undefined, now, settings }
  return {
    linkedRoles: resolveStatus("linkedRoles", linkedRoles),
    supportBot: resolveStatus("supportBot", supportBot, fill),
  }
}
