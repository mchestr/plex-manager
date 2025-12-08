import { z } from "zod"

// Enums matching Prisma schema
export const MediaTypeEnum = z.enum(["MOVIE", "TV_SERIES", "EPISODE"])

export const MarkTypeEnum = z.enum([
  "FINISHED_WATCHING",
  "NOT_INTERESTED",
  "KEEP_FOREVER",
  "REWATCH_CANDIDATE",
  "POOR_QUALITY",
  "WRONG_VERSION",
])

export const IntentTypeEnum = z.enum([
  "PLAN_TO_WATCH",
  "WATCHING",
  "COMPLETED",
  "DROPPED",
  "ON_HOLD",
])

// User media mark schemas
export const CreateUserMediaMarkSchema = z.object({
  mediaType: MediaTypeEnum,
  plexRatingKey: z.string().min(1, "Plex rating key is required"),
  radarrId: z.number().optional(),
  sonarrId: z.number().optional(),
  title: z.string().min(1, "Title is required"),
  year: z.number().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  parentTitle: z.string().optional(),
  markType: MarkTypeEnum,
  note: z.string().optional(),
  markedVia: z.string().default("web"),
  discordChannelId: z.string().optional(),
})

// User watch intent schemas
export const CreateUserWatchIntentSchema = z.object({
  plexRatingKey: z.string().min(1, "Plex rating key is required"),
  mediaType: MediaTypeEnum,
  title: z.string().min(1, "Title is required"),
  intentType: IntentTypeEnum,
  priority: z.number().default(0),
  currentSeason: z.number().optional(),
  currentEpisode: z.number().optional(),
})

// Type exports
export type MediaType = z.infer<typeof MediaTypeEnum>
export type MarkType = z.infer<typeof MarkTypeEnum>
export type IntentType = z.infer<typeof IntentTypeEnum>
export type CreateUserMediaMark = z.infer<typeof CreateUserMediaMarkSchema>
export type CreateUserWatchIntent = z.infer<typeof CreateUserWatchIntentSchema>
