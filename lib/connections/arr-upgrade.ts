/**
 * What a better copy reads from Radarr or Sonarr besides the file itself: the
 * quality profile that decides whether an upgrade is wanted, the state of the
 * search command it sent, and the queue and history of the title it watches
 * (docs/problem-reports.md, "Look for a better copy").
 *
 * | Call                     | Endpoint                                                      |
 * |--------------------------|---------------------------------------------------------------|
 * | {@link getArrQualityProfile} | `GET /api/v3/qualityprofile/{id}`                         |
 * | {@link getArrCommandState}   | `GET /api/v3/command/{id}`; a 404 is `gone`               |
 * | {@link listTitleQueue}       | `GET /api/v3/queue/details?movieId=` or `?seriesId=`      |
 * | {@link listTitleHistory}     | `GET /api/v3/history/movie?movieId=` or `/history/series?seriesId=` |
 *
 * A list record that fails its schema is skipped, as in `arrList`.
 *
 * @module lib/connections/arr-upgrade
 */

import "server-only"

import { z } from "zod"

import { arrList, arrQuery, invalidArrParams } from "@/lib/connections/arr-client"
import { serviceFetch, toConnectionResult, type ServiceResult } from "@/lib/connections/http"
import { type ConnectionResult } from "@/types/connection"

type ArrService = "Radarr" | "Sonarr"
type ArrConfig = { url: string; apiKey: string }

/** The title a run watches: a Radarr movie or a Sonarr series. */
export type ArrTitle = { service: "radarr" | "sonarr"; id: number }

/** A field the service may leave out or send as null: always `null` when it isn't the type. */
export const orNull = <T extends z.ZodType>(schema: T) => schema.nullish().catch(null).transform((value) => value ?? null)

/** A quality and its revision (a proper or repack is a higher version), from a `QualityModel`. */
export const arrQualitySchema = z
  .looseObject({
    quality: z.looseObject({ id: z.number().int(), name: orNull(z.string()) }),
    revision: z.looseObject({ version: z.number().int(), real: z.number().int() }).optional().catch(undefined),
  })
  .transform(({ quality, revision }) => ({ id: quality.id, name: quality.name, version: revision?.version ?? 1, real: revision?.real ?? 0 }))

/** A quality as the swap rules compare it. */
export type ArrQuality = z.infer<typeof arrQualitySchema>

/** Language ids; an unreadable list is none. */
export const arrLanguagesSchema = z
  .array(z.looseObject({ id: z.number().int() }))
  .optional()
  .catch(undefined)
  .transform((languages) => (languages ?? []).map((language) => language.id))

/** A movie's or episode's file, with the service's own judgement of it against the quality profile. */
export const arrFileSchema = z
  .looseObject({
    id: z.number().int(),
    relativePath: orNull(z.string()),
    path: orNull(z.string()),
    size: orNull(z.number()),
    qualityCutoffNotMet: orNull(z.boolean()),
    customFormatScore: orNull(z.number().int()),
    sceneName: orNull(z.string()),
    quality: orNull(arrQualitySchema),
    languages: arrLanguagesSchema,
  })
  .transform(({ id, relativePath, path, size, qualityCutoffNotMet, customFormatScore, sceneName, quality, languages }) => ({
    id,
    relativePath,
    path,
    size,
    qualityCutoffNotMet,
    customFormatScore,
    sceneName,
    quality,
    languages,
  }))

/** A file in Radarr or Sonarr. */
export type ArrFile = z.infer<typeof arrFileSchema>

const positiveId = z.number().int().positive()
const movieParams = z.strictObject({ movieId: positiveId })
const seriesParams = z.strictObject({ seriesId: positiveId })

const profileItemSchema = z.looseObject({
  quality: orNull(z.looseObject({ id: z.number().int() })),
  items: z.array(z.looseObject({ quality: orNull(z.looseObject({ id: z.number().int() })) })).optional().catch(undefined),
})

const profileSchema = z
  .looseObject({
    id: z.number().int(),
    upgradeAllowed: z.boolean(),
    /** The custom format score at which upgrades stop; versions before custom formats have none. */
    cutoffFormatScore: orNull(z.number().int()),
    items: z.array(profileItemSchema).optional().catch(undefined),
  })
  .transform(({ id, upgradeAllowed, cutoffFormatScore, items }) => ({
    id,
    upgradeAllowed,
    cutoffFormatScore,
    /** The profile's qualities from worst to best; a group's qualities rank the same. */
    qualityOrder: (items ?? []).map((item) => (item.quality ? [item.quality.id] : (item.items ?? []).flatMap((inner) => (inner.quality ? [inner.quality.id] : [])))),
  }))

/** A quality profile, as far as the upgrade rule reads it. */
export type ArrQualityProfile = z.infer<typeof profileSchema>

const commandSchema = z.looseObject({ id: z.number().int(), status: z.string() })

/** A command's state: `gone` when the service no longer has it, as after a restart. */
export type ArrCommandState = "running" | "done" | "failed" | "gone"

const RUNNING = new Set(["queued", "started"])

const queueSchema = z
  .looseObject({
    id: z.number().int(),
    downloadId: orNull(z.string()),
    episodeId: orNull(z.number().int()),
    status: orNull(z.string()),
    trackedDownloadState: orNull(z.string()),
    trackedDownloadStatus: orNull(z.string()),
  })
  .transform(({ downloadId, episodeId, status, trackedDownloadState, trackedDownloadStatus }) => ({ downloadId, episodeId, status, trackedDownloadState, trackedDownloadStatus }))

/** One download in the queue. */
export type ArrQueueItem = z.infer<typeof queueSchema>

const historySchema = z
  .looseObject({
    id: z.number().int(),
    eventType: z.string(),
    date: z.iso.datetime({ offset: true }),
    sourceTitle: orNull(z.string()),
    downloadId: orNull(z.string()),
    episodeId: orNull(z.number().int()),
    data: z.record(z.string(), z.unknown()).nullish().catch(null),
  })
  .transform(({ id, eventType, date, sourceTitle, downloadId, episodeId, data }) => ({
    id,
    eventType,
    at: Date.parse(date),
    sourceTitle,
    downloadId,
    episodeId,
    /** An import's file id, from `data.fileId`. */
    fileId: typeof data?.fileId === "string" && /^\d+$/.test(data.fileId) ? Number(data.fileId) : null,
    /** A torrent grab's info hash, lower case. */
    infoHash: typeof data?.torrentInfoHash === "string" && data.torrentInfoHash ? data.torrentInfoHash.toLowerCase() : null,
  }))

/** One history record, with its time in epoch milliseconds. */
export type ArrHistoryRecord = z.infer<typeof historySchema>

const serviceName = (title: ArrTitle): ArrService => (title.service === "radarr" ? "Radarr" : "Sonarr")
const titleQuery = (title: ArrTitle) => (title.service === "radarr" ? arrQuery(movieParams, { movieId: title.id }) : arrQuery(seriesParams, { seriesId: title.id }))

/** A GET of `<path>/<id>`, or null for an id that isn't a positive whole number. */
function readById<T>(service: ArrService, config: ArrConfig, path: string, id: number, schema: z.ZodType<T>): Promise<ServiceResult<T>> | null {
  if (!positiveId.safeParse(id).success) return null
  return serviceFetch({ service, url: `${config.url}${path}/${id}`, headers: { "X-Api-Key": config.apiKey }, schema })
}

export async function getArrQualityProfile(service: ArrService, config: ArrConfig, id: number): Promise<ConnectionResult<ArrQualityProfile>> {
  const result = await readById(service, config, "/api/v3/qualityprofile", id, profileSchema)
  return result ? toConnectionResult(service, result) : invalidArrParams(service)
}

/** Where a command the app sent stands: queued or started is `running`, completed is `done`, anything else that ended is `failed`. */
export async function getArrCommandState(service: ArrService, config: ArrConfig, id: number): Promise<ConnectionResult<ArrCommandState>> {
  const result = await readById(service, config, "/api/v3/command", id, commandSchema)
  if (!result) return invalidArrParams(service)
  if (!result.ok) return result.code === "HTTP" && result.status === 404 ? { success: true, data: "gone" } : toConnectionResult(service, result)
  const { status } = result.data
  return { success: true, data: RUNNING.has(status) ? "running" : status === "completed" ? "done" : "failed" }
}

/** The title's downloads in the queue, with their tracked state. */
export async function listTitleQueue(config: ArrConfig, title: ArrTitle): Promise<ConnectionResult<ArrQueueItem[]>> {
  return arrList(serviceName(title), config, "/api/v3/queue/details", titleQuery(title), queueSchema)
}

/** The title's history, as the service orders it. */
export async function listTitleHistory(config: ArrConfig, title: ArrTitle): Promise<ConnectionResult<ArrHistoryRecord[]>> {
  const path = title.service === "radarr" ? "/api/v3/history/movie" : "/api/v3/history/series"
  return arrList(serviceName(title), config, path, titleQuery(title), historySchema)
}
