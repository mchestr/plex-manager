/**
 * The member export's format (P11.15, GAP-36): `MemberExportV1`, a strict
 * schema, so a key the export does not mean to publish fails validation
 * instead of reaching the download.
 *
 * {@link EXPORT_COVERAGE} records, for every model in the "Member data" table
 * of `docs/privacy.md`, the export key that carries it or why it is left out.
 * A test fails when a model in that table has neither.
 *
 * @module lib/members/export-schema
 */

import { z } from "zod"

export const EXPORT_FORMAT = "plex-manager-member-export"

const at = z.iso.datetime()
const json = z.unknown()

const profile = z.strictObject({
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  services: z.array(z.enum(["plex", "jellyfin"])),
  plexUserId: z.string().nullable(),
  jellyfinUserId: z.string().nullable(),
  timezone: z.string().nullable(),
  createdAt: at,
})

const rewind = z.strictObject({
  year: z.number().int(),
  edition: z.string().nullable(),
  status: z.string(),
  generatedAt: at.nullable(),
  /** 1, 2 or 3; null when the stored data could not be read or is not complete. */
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  data: z.record(z.string(), json).nullable(),
})

const rewindPrefs = z.strictObject({
  year: z.number().int(),
  signed: z.boolean(),
  includeArt: z.boolean(),
  dailyDetail: z.boolean(),
  cardFacts: json,
  notify: z.boolean(),
})

const rewindExclusion = z.strictObject({ ratingKey: z.string(), kind: z.string(), title: z.string().nullable(), hiddenAt: at })

const rewindShare = z.strictObject({
  year: z.number().int(),
  pages: json,
  signed: z.boolean(),
  includeArt: z.boolean(),
  dailyDetail: z.boolean(),
  status: z.enum(["active", "expired", "revoked"]),
  createdAt: at,
  expiresAt: at.nullable(),
  revokedAt: at.nullable(),
})

const mark = z.strictObject({
  mediaType: z.string(),
  plexRatingKey: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  parentTitle: z.string().nullable(),
  seasonNumber: z.number().int().nullable(),
  episodeNumber: z.number().int().nullable(),
  markType: z.string(),
  note: z.string().nullable(),
  markedVia: z.string(),
  markedAt: at,
})

const watchlist = z.strictObject({
  settings: z
    .strictObject({
      syncEnabled: z.boolean(),
      lastSyncAt: at.nullable(),
      lastSyncStatus: z.string().nullable(),
      totalItemsSynced: z.number().int(),
      totalItemsRequested: z.number().int(),
    })
    .nullable(),
  history: z.array(
    z.strictObject({
      title: z.string(),
      year: z.number().int().nullable(),
      mediaType: z.string(),
      plexRatingKey: z.string(),
      tmdbId: z.number().int().nullable(),
      tvdbId: z.number().int().nullable(),
      imdbId: z.string().nullable(),
      status: z.string(),
      syncedAt: at,
      requestedAt: at.nullable(),
    })
  ),
})

const subscription = z.strictObject({
  status: z.string(),
  plan: z.string(),
  currentPeriodEnd: at.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: at.nullable(),
})

const discord = z.strictObject({ username: z.string(), globalName: z.string().nullable(), linkedAt: at })

const assistantTurn = z.strictObject({
  conversationId: z.string(),
  at,
  model: z.string().nullable(),
  prompt: z.string().nullable(),
  response: z.string().nullable(),
})

const discordCommand = z.strictObject({
  commandType: z.string(),
  commandName: z.string(),
  channelType: z.string(),
  status: z.string(),
  argsLength: z.number().int().nullable(),
  at,
})

export const MemberExportV1 = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: at,
  profile,
  rewinds: z.array(rewind),
  rewindPrefs: z.array(rewindPrefs),
  rewindExclusions: z.array(rewindExclusion),
  rewindShares: z.array(rewindShare),
  marks: z.array(mark),
  watchlist,
  subscription: subscription.nullable(),
  discord: discord.nullable(),
  assistantConversations: z.array(assistantTurn),
  discordCommands: z.array(discordCommand),
})

export type MemberExportV1 = z.infer<typeof MemberExportV1>

type ExportKey = Exclude<keyof MemberExportV1, "format" | "version" | "exportedAt">

/** The newest assistant turns an export carries. */
export const ASSISTANT_TURN_LIMIT = 500

/**
 * Each model of `docs/privacy.md`'s "Member data" table: the export key that
 * carries it, or `{ excluded }` with the reason it is left out. The coverage
 * test reads it against the doc.
 *
 * @internal
 */
export const EXPORT_COVERAGE: Record<string, ExportKey | { excluded: string }> = {
  User: "profile",
  PlexWrapped: "rewinds",
  RewindGeneration: { excluded: "run records for admins; the Rewind they made is in rewinds" },
  RewindShare: "rewindShares",
  RewindShareVisitDay: { excluded: "daily visit counts of a link, about visitors rather than the member" },
  RewindView: { excluded: "reading progress for the season dashboard's totals" },
  RewindPrefs: "rewindPrefs",
  RewindExclusion: "rewindExclusions",
  WrappedShareVisit: { excluded: "data about the visitors of a 2025 share link, not the member" },
  LLMUsage: "assistantConversations",
  ChatConversation: "assistantConversations",
  DiscordConnection: "discord",
  DiscordChatSession: { excluded: "a working copy of turns already in assistantConversations" },
  DiscordOAuthState: { excluded: "a link attempt that expires within minutes" },
  DiscordPendingSelection: { excluded: "a /mark search that expires within minutes" },
  DiscordCommandLog: "discordCommands",
  UserMediaMark: "marks",
  WatchlistSyncSettings: "watchlist",
  WatchlistSyncHistory: "watchlist",
  InviteUsage: { excluded: "which invite admitted the member; invites are server records" },
  Subscription: "subscription",
  AuditLog: { excluded: "the operator's security record, ids only" },
  RequestTierRun: { excluded: "the operator's request-limit run history, keyed by Overseerr user, newest 30 runs" },
}
