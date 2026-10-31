import "server-only"

import { z } from "zod"

/**
 * Field schemas and projections the Sonarr and Radarr tools share. Upstream
 * records carry whole nested series, movies, files, images and custom
 * formats; the tools keep only the fields an answer needs. A field of an
 * unexpected type is left out rather than failing its record.
 *
 * @module
 */

export const text = z.string().optional().catch(undefined)
export const num = z.number().optional().catch(undefined)
export const flag = z.boolean().optional().catch(undefined)

/** Longest title, release name, message and overview a record keeps. */
export const TITLE_MAX = 150
const RELEASE_MAX = 200
const MESSAGE_MAX = 300
export const OVERVIEW_MAX = 200

/** `value` cut to `max` characters, marked with an ellipsis when cut. */
export function clip(value: string | undefined, max: number): string | undefined {
  return value === undefined || value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** A positive id or year, or nothing: Sonarr and Radarr send 0 for one they do not know. */
export function known(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined
}

/** The day of a release date sent as UTC midnight ("2026-11-02T00:00:00Z" is "2026-11-02"). */
export function day(value: string | undefined): string | undefined {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value
}

/** `{ quality: { quality: { name } } }`, as history and queue records carry it. */
const quality = z.object({ quality: z.object({ name: text }).optional().catch(undefined) }).optional().catch(undefined)

/** The `data` fields of a history record that say why: a failure's message, a deletion's reason, a grab's indexer. */
const historyData = z.object({ message: text, reason: text, indexer: text }).optional().catch(undefined)

/** The fields of a history record both services share, read with {@link historyOf}. */
export const historyFields = { date: text, eventType: text, sourceTitle: text, quality, data: historyData }
const historyShape = z.object(historyFields)

/** A history record's event, release, flat quality name, and why it failed or was deleted. */
export function historyOf(record: z.output<typeof historyShape>) {
  return {
    date: record.date,
    eventType: record.eventType,
    sourceTitle: clip(record.sourceTitle, RELEASE_MAX),
    quality: record.quality?.quality?.name,
    message: clip(record.data?.message ?? record.data?.reason, MESSAGE_MAX),
    indexer: record.data?.indexer,
  }
}

const statusMessages = z.array(z.object({ messages: z.array(z.string()).optional().catch(undefined) })).optional().catch(undefined)

/** The fields of a queue item both services share, read with {@link queueOf}. */
export const queueFields = {
  title: text,
  quality,
  status: text,
  trackedDownloadStatus: text,
  trackedDownloadState: text,
  size: num,
  sizeleft: num,
  timeleft: text,
  estimatedCompletionTime: text,
  errorMessage: text,
  statusMessages,
}
const queueShape = z.object(queueFields)

/**
 * A queue item's release, progress and state. `statusMessage` joins the
 * distinct `statusMessages` (why an import is blocked) into one line; it is
 * not on the Discord allowlist, since such messages can name download paths.
 */
export function queueOf(item: z.output<typeof queueShape>) {
  const messages = [...new Set((item.statusMessages ?? []).flatMap((entry) => entry.messages ?? []))]
  return {
    title: clip(item.title, RELEASE_MAX),
    quality: item.quality?.quality?.name,
    status: item.status,
    trackedDownloadStatus: item.trackedDownloadStatus,
    trackedDownloadState: item.trackedDownloadState,
    size: item.size,
    sizeleft: item.sizeleft,
    timeleft: item.timeleft,
    estimatedCompletionTime: item.estimatedCompletionTime,
    errorMessage: clip(item.errorMessage, MESSAGE_MAX),
    statusMessage: messages.length > 0 ? clip(messages.join(" | "), MESSAGE_MAX) : undefined,
  }
}

const qualityLeaf = z.object({ quality: z.object({ id: num, name: text }).optional().catch(undefined), allowed: flag })
const qualityItem = qualityLeaf.extend({ id: num, name: text, items: z.array(qualityLeaf).optional().catch(undefined) })

/** A single quality's name, or a group's name with its qualities ("WEB 1080p (WEBDL-1080p, WEBRip-1080p)"). */
function qualityLabel(item: z.output<typeof qualityItem>): string | undefined {
  const members = (item.items ?? []).map((leaf) => leaf.quality?.name).filter((name) => name !== undefined)
  return members.length > 0 ? `${item.name ?? "Group"} (${members.join(", ")})` : item.quality?.name
}

/**
 * A quality profile as its name, cutoff and allowed qualities, lowest first.
 * The cutoff is the id of a quality or of a group (1000 and up); it becomes
 * that one's name.
 */
export const qualityProfile = z
  .object({ id: num, name: text, upgradeAllowed: flag, cutoff: num, items: z.array(qualityItem).optional().catch(undefined) })
  .transform((profile) => {
    const items = profile.items ?? []
    const cutoff = items.find((item) => (item.items?.length ? item.id : item.quality?.id) === profile.cutoff)
    return {
      id: profile.id,
      name: profile.name,
      upgradeAllowed: profile.upgradeAllowed,
      cutoff: cutoff ? (cutoff.items?.length ? cutoff.name : cutoff.quality?.name) : profile.cutoff,
      allowed: items.filter((item) => item.allowed).map(qualityLabel).filter((label) => label !== undefined),
    }
  })

/** A root folder without its `unmappedFolders` list (every folder the library does not hold), with their count. */
export const rootFolder = z
  .looseObject({ unmappedFolders: z.array(z.unknown()).optional().catch(undefined) })
  .transform(({ unmappedFolders, ...folder }) => ({ ...folder, unmappedFolderCount: unmappedFolders?.length ?? 0 }))

/** Alternate titles a details reply keeps. */
const ALTERNATE_TITLES_KEPT = 5

/**
 * A series, movie or episode as the details tools return it, without its
 * heavy arrays: `images` at any depth are dropped, and only the first five
 * `alternateTitles` are kept, with `alternateTitleCount` when there are more.
 */
export function trimDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(trimDetails)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]): [string, unknown][] => {
      if (key === "images") return []
      if (key !== "alternateTitles" || !Array.isArray(child)) return [[key, trimDetails(child)]]
      const kept: [string, unknown][] = [[key, child.slice(0, ALTERNATE_TITLES_KEPT).map(trimDetails)]]
      return child.length > ALTERNATE_TITLES_KEPT ? [...kept, ["alternateTitleCount", child.length]] : kept
    })
  )
}
