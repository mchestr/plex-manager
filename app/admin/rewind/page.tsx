import { getRewindSeasonDataPreparedAt } from "@/lib/data/rewind-season"
import { SeasonActions } from "@/components/admin/rewind/season-actions"
import { SeasonFacts } from "@/components/admin/rewind/season-facts"
import { SeasonMeasures } from "@/components/admin/rewind/season-measures"
import { SeasonMemberTable } from "@/components/admin/rewind/season-member-table"
import { SeasonPreflight } from "@/components/admin/rewind/season-preflight"
import { SeasonProgress } from "@/components/admin/rewind/season-progress"
import { PageHeader } from "@/components/ui/page-header"
import { getFrozenRewindModel } from "@/lib/llm/registry"
import { prisma } from "@/lib/prisma"
import { rewindFeatureOn } from "@/lib/rewind/features"
import { seasonAudienceSwitchAt } from "@/lib/rewind/season-open"
import { seasonPrepareAt, seasonThrough, seasonZones } from "@/lib/rewind/season-runs"
import { getFormat } from "@/lib/settings/app-settings"
import { parseTableParams } from "@/lib/ui/table-params"
import { serverZone } from "@/lib/utils/server-zone"
import { instantToWallTime } from "@/lib/utils/zoned-time"
import { getRewindSuccessMeasures } from "@/lib/wrapped/admin/measures"
import { getRewindPreflight } from "@/lib/wrapped/admin/preflight"
import { getSeasonCounts, SEASON_STATES, type SeasonMemberState } from "@/lib/wrapped/admin/season"
import { getSeasonBudget, loadSeasonEstimate } from "@/lib/wrapped/admin/season-estimate"
import { listSeasonMembers } from "@/lib/wrapped/admin/season-members"
import { lockedModelLabel, REWIND_LOCK, type FrozenRewindModel } from "@/lib/wrapped/freeze/lock"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"
import { getSeasonState } from "@/lib/wrapped/season"
import { assertAdmin } from "@/lib/admin"

const EDITIONS = ["full", "pocket", "postcard"]
const COPY_SOURCES = ["llm", "repair", "mixed", "template"]

const pick = <T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null

const onOff = (value: boolean) => (value ? "On" : "Off")

/** A JSON string list as "discord, banner"; anything else is empty. */
const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : "")

/** The model line: the frozen model, the row's own before the lock names one, or why it writes templates. */
function describeModel(frozen: FrozenRewindModel | null, templateOnly: boolean): string {
  if (templateOnly) return "Template text only"
  if (!frozen) return "None set"
  if (frozen.status === "mismatch") return `Template text: the provider is ${frozen.provider}, the frozen model ${lockedModelLabel(frozen.locked)}`
  return frozen.model
}

/** "Frozen 1 December 2026" once the lock names a model; until then what is left to do. */
function describeFreeze(frozenAt: string, formatDate: (date: Date) => string): string {
  return REWIND_LOCK.model ? `Frozen ${formatDate(new Date(`${frozenAt}T12:00:00Z`))}` : "Not frozen: no model selected yet"
}

/** The 08:00 audience switch, or that the owner switches by hand. */
function describeSwitch(at: Date, now: number, server: string, autoOpen: boolean, formatDate: (date: Date) => string): string {
  if (at.getTime() <= now) return "Not scheduled: the season has opened"
  const time = `${instantToWallTime(at, server).slice(11)} in ${server} on ${formatDate(at)}`
  return autoOpen ? time : "By hand in Settings"
}

/** "02:15 in America/Chicago, which is 00:15 in America/Los_Angeles" for the season-open run. */
function describePrepare(at: Date, now: number, server: string, zones: string[], opens: string): string {
  if (at.getTime() <= now) return "Not scheduled: the season has opened"
  const west = zones.find((zone) => instantToWallTime(at, zone).endsWith("T00:15"))
  const local = `${instantToWallTime(at, server).slice(11)} in ${server}`
  return west && west !== server ? `${local}, which is 00:15 in ${west}, on ${opens}` : `${local} on ${opens}`
}

export default async function RewindSeasonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await assertAdmin()
  const params = await searchParams
  const now = new Date().getTime()
  const season = await getSeasonState(new Date(now))
  const year = season.seasonYear

  const table = parseTableParams(params, { sortable: ["name"], defaultSort: { id: "name", desc: false } })
  const filters = {
    state: pick<SeasonMemberState>(params.status, SEASON_STATES),
    edition: pick(params.edition, EDITIONS),
    copySource: pick(params.copy, COPY_SOURCES),
  }
  const filtered = Boolean(filters.state || filters.edition || filters.copySource)

  const [f, zone, zones, through, config, provider, preparedAt] = await Promise.all([
    getFormat(),
    serverZone(),
    seasonZones(),
    seasonThrough(year, now),
    prisma.config.findUnique({ where: { id: "config" } }),
    getFrozenRewindModel(),
    getRewindSeasonDataPreparedAt(year),
  ])
  const [preflight, counts, budget, all, failed, members, memberTotal, measures] = await Promise.all([
    getRewindPreflight(),
    getSeasonCounts(year, now),
    getSeasonBudget(year),
    loadSeasonEstimate(year, through, "all"),
    loadSeasonEstimate(year, through, "failed"),
    listSeasonMembers(year, filters, table, now),
    prisma.user.count({ where: { disabledAt: null, plexUserId: { not: null } } }),
    getRewindSuccessMeasures(year),
  ])

  const opensMd = config?.rewindSeasonOpens ?? "12-01"
  const prepareAt = seasonPrepareAt(year, opensMd, zones)
  const switchAt = seasonAudienceSwitchAt(year, opensMd, zone)
  const longDate = (date: Date) => f.date(date, "long")
  const lastDay = through.endsWith("12-31") ? "31 December" : "30 November"

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6" data-testid="admin-rewind-page">
      <PageHeader
        title="Season"
        description={`Rewind ${year}`}
        actions={<SeasonActions year={year} estimates={{ all, failed }} />}
        data-testid="admin-rewind-header"
      />
      <SeasonProgress year={year} initial={counts} budget={budget} />
      <SeasonMeasures measures={measures} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <SeasonPreflight rows={preflight} />
        <SeasonFacts
          opens={f.date(season.opensAt, "long")}
          closes={f.date(season.closesAt.getTime() - 1, "long")}
          dataWindow={`1 January to ${lastDay} ${year}, in each member's zone`}
          model={describeModel(provider, Boolean(config?.llmDisabled || config?.rewindLlmMode === "off"))}
          promptVersion={PROMPT_VERSION}
          freeze={describeFreeze(REWIND_LOCK.frozenAt, longDate)}
          audienceSwitch={describeSwitch(switchAt, now, zone, rewindFeatureOn(config, "season.auto-open"), longDate)}
          prepareRuns={describePrepare(prepareAt, now, zone, zones, f.date(prepareAt, "long"))}
          dataPreparedAt={preparedAt ? f.dateTime(preparedAt) : "Not yet"}
          flags={[
            { label: "Rewind", value: onOff(config?.rewindEnabled ?? false) },
            { label: "Audience", value: config?.rewindAudience === "all" ? "Everyone" : "Admins" },
            { label: "AI copy", value: config?.rewindLlmMode ?? "standard" },
            { label: "Season budget", value: f.money(Number(config?.rewindLlmBudgetUsd ?? 10)) },
            { label: "Public links", value: onOff(config?.rewindPublicLinks ?? true) },
            { label: "Counts on public cards", value: onOff(config?.rewindPublicCounts ?? false) },
            { label: "Server name on cards", value: onOff(config?.rewindShowServerNameOnCards ?? true) },
            { label: "Art on cards", value: onOff(config?.rewindAllowArtOnCards ?? true) },
            { label: "Managed accounts", value: onOff(config?.rewindIncludeManagedUsers ?? false) },
            { label: "Sound", value: onOff(config?.rewindAudio ?? false) },
            { label: "Ready notices", value: listOf(config?.rewindNotifyChannels) || "None" },
            { label: "Turned-off pages", value: listOf(config?.rewindDisabledPages) || "None" },
          ]}
        />
      </div>
      <section aria-labelledby="season-members-heading" className="flex flex-col gap-3">
        <h2 id="season-members-heading" className="text-h3">
          Members
        </h2>
        <SeasonMemberTable
          year={year}
          rows={members.rows}
          total={members.total}
          members={memberTotal}
          page={table.page}
          pageSize={table.pageSize}
          filtered={filtered}
          now={now}
        />
      </section>
    </div>
  )
}
