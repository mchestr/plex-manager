import "server-only"

import { getSonarrCalendar, getSonarrHistory, getSonarrQueue, getSonarrSeries, getSonarrWantedMissing } from "@/lib/connections/sonarr"
import { ARR_MAX_RECORDS } from "@/lib/connections/arr-client"
import { type SonarrParsed } from "@/lib/validations/sonarr"

import { calendarRange, optionalText, optionalWhole, wholeArg } from "./arr-args"
import { arrListOutput, arrPageOutput, idForTitle, orElse, type ArrFilter } from "./arr-output"
import { episodeRecord, historyRecord, queueRecord } from "./sonarr-projections"

/**
 * Sonarr's list tools (history, queue, calendar, wanted/missing), each for the
 * whole server or for one series: `seriesId`, or the library series whose
 * title matches `seriesName`. Sonarr filters history itself; the queue,
 * calendar and wanted list are read to a cap and filtered here. Every reply
 * says how to see what it could not show.
 *
 * @module
 */

/** Most records a reply holds, so it stays under the tool result limit (see arr-output). */
const HISTORY_MAX = 50
const QUEUE_MAX = 50
const CALENDAR_MAX = 100
const WANTED_MAX = 50

const PASS_SERIES = "pass a series (seriesId or seriesName)"
/** The wanted list is read to a cap, so a series' older missing episodes are found from its episodes. */
const EVERY_MISSING = "to find every missing one, list the series' episodes with get_sonarr_episodes: a monitored, aired episode with hasFile false is missing"

type Args = Record<string, unknown>

/** How to name a series: in Discord only by its title, since no Discord tool gives a seriesId. */
function passSeries(discord: boolean): string {
  return discord ? "pass a seriesName" : PASS_SERIES
}

/**
 * How to narrow a history reply: to a series, then to one of its episodes.
 * In Discord only to a series by name: no Discord tool gives an episodeId.
 */
function narrowerHistory(seriesId: number | undefined, discord: boolean): string | undefined {
  if (seriesId === undefined) return discord ? passSeries(true) : `${PASS_SERIES} or an episodeId`
  return discord ? undefined : "pass an episodeId (from get_sonarr_episodes) for one episode's history"
}

/**
 * The series a tool asks about: `seriesId`, or the library series whose title
 * matches `seriesName`. Neither given is every series; a name with no match,
 * or a seriesId that cannot be read with no name to fall back on, is an
 * `error` to return as the tool output.
 */
async function resolveSeries(config: SonarrParsed, args: Args): Promise<{ seriesId?: number } | { error: string }> {
  const id = optionalWhole(args, "seriesId")
  if (!("error" in id) && id.value !== undefined) return { seriesId: id.value }
  const name = optionalText(args, "seriesName")
  if ("error" in name) return name
  if (name.value === undefined) return "error" in id ? id : {}
  const library = await getSonarrSeries(config)
  if (!library.success) return { error: JSON.stringify({ error: library.error }) }
  const seriesId = idForTitle(library.data, name.value)
  if (seriesId === undefined) return { error: JSON.stringify({ error: `Series "${name.value}" not found in Sonarr library` }) }
  return { seriesId }
}

function seriesFilter(seriesId: number | undefined, season?: number): ArrFilter | undefined {
  return seriesId === undefined ? undefined : { key: "seriesId", id: seriesId, season }
}

/**
 * get_sonarr_history: a series reads /history/series and an episode
 * /history?episodeId=, so Sonarr filters. `discord` cuts the paths in its
 * failure messages and offers only what Discord can pass.
 */
export async function historyOutput(config: SonarrParsed, args: Args, discord: boolean): Promise<string> {
  const pageSize = wholeArg(args.pageSize, 20, HISTORY_MAX)
  const episode = optionalWhole(args, "episodeId")
  if ("error" in episode) return episode.error
  const series = await resolveSeries(config, args)
  if ("error" in series) return series.error
  const episodeId = episode.value
  const more = orElse(pageSize < HISTORY_MAX && `pass a pageSize up to ${HISTORY_MAX}`, episodeId === undefined && narrowerHistory(series.seriesId, discord))
  const reply = { project: historyRecord(discord), limit: pageSize, more }
  return arrPageOutput(await getSonarrHistory(config, { pageSize, seriesId: series.seriesId, episodeId }), reply)
}

/**
 * get_sonarr_queue: the queue cannot filter by series on every Sonarr
 * version, so a series' items, or one season's, are read up to the cap and
 * filtered here, keeping every match that fits, since a season pack is one
 * item per episode. `discord` cuts the paths in its messages.
 */
export async function queueOutput(config: SonarrParsed, args: Args, discord: boolean): Promise<string> {
  const season = optionalWhole(args, "seasonNumber", 0)
  if ("error" in season) return season.error
  const series = await resolveSeries(config, args)
  if ("error" in series) return series.error
  const project = queueRecord(discord)
  if (series.seriesId === undefined) {
    if (season.value !== undefined) return "Error: 'seasonNumber' needs a series (seriesId or seriesName)"
    return arrPageOutput(await getSonarrQueue(config, QUEUE_MAX), { project, limit: QUEUE_MAX, more: `${passSeries(discord)} to see only its items` })
  }
  const more = season.value === undefined ? "pass seasonNumber to see one season's items" : undefined
  return arrPageOutput(await getSonarrQueue(config, ARR_MAX_RECORDS), { project, limit: ARR_MAX_RECORDS, more }, seriesFilter(series.seriesId, season.value))
}

/** get_sonarr_calendar: the episodes in the date range, filtered here to a series. */
export async function calendarOutput(config: SonarrParsed, args: Args): Promise<string> {
  const { start, end } = calendarRange(args)
  const series = await resolveSeries(config, args)
  if ("error" in series) return series.error
  const more = `narrow the date range (startDate, endDate)${series.seriesId === undefined ? " or pass a series" : ""} to see the rest`
  return arrListOutput(await getSonarrCalendar(config, start, end), { project: episodeRecord, limit: CALENDAR_MAX, more }, seriesFilter(series.seriesId))
}

/**
 * get_sonarr_wanted_missing: wanted/missing cannot filter by series, so a
 * series' missing episodes are read up to the cap and filtered here, keeping
 * every match that fits, whatever the pageSize.
 */
export async function wantedMissingOutput(config: SonarrParsed, args: Args): Promise<string> {
  const pageSize = wholeArg(args.pageSize, 20, WANTED_MAX)
  const series = await resolveSeries(config, args)
  if ("error" in series) return series.error
  if (series.seriesId === undefined) {
    const more = orElse(pageSize < WANTED_MAX && `pass a pageSize up to ${WANTED_MAX}`, PASS_SERIES)
    return arrPageOutput(await getSonarrWantedMissing(config, pageSize), { project: episodeRecord, limit: pageSize, more })
  }
  const reply = { project: episodeRecord, limit: ARR_MAX_RECORDS, more: EVERY_MISSING, morePastRead: true }
  return arrPageOutput(await getSonarrWantedMissing(config, ARR_MAX_RECORDS), reply, seriesFilter(series.seriesId))
}
