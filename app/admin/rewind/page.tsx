import { getRewindSeasonDataPreparedAt } from "@/actions/admin/rewind-season"
import { SeasonActions } from "@/components/admin/rewind/season-actions"
import { SeasonFacts } from "@/components/admin/rewind/season-facts"
import { SeasonMemberTable } from "@/components/admin/rewind/season-member-table"
import { SeasonPreflight } from "@/components/admin/rewind/season-preflight"
import { SeasonProgress } from "@/components/admin/rewind/season-progress"
import { PageHeader } from "@/components/ui/page-header"
import { prisma } from "@/lib/prisma"
import { finalCutOpensAt, seasonPrepareAt, seasonThrough, seasonZones } from "@/lib/rewind/season-runs"
import { getFormat } from "@/lib/settings/app-settings"
import { parseTableParams } from "@/lib/ui/table-params"
import { serverZone } from "@/lib/utils/server-zone"
import { instantToWallTime } from "@/lib/utils/zoned-time"
import { getRewindPreflight } from "@/lib/wrapped/admin/preflight"
import { getSeasonCounts, SEASON_STATES, type SeasonMemberState } from "@/lib/wrapped/admin/season"
import { getSeasonBudget, loadSeasonEstimate } from "@/lib/wrapped/admin/season-estimate"
import { listSeasonMembers } from "@/lib/wrapped/admin/season-members"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"
import { getSeasonState } from "@/lib/wrapped/season"

export const dynamic = "force-dynamic"

const EDITIONS = ["full", "pocket", "postcard"]
const COPY_SOURCES = ["llm", "repair", "mixed", "template"]

const pick = <T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null

const onOff = (value: boolean) => (value ? "On" : "Off")

/** A JSON string list as "discord, banner"; anything else is empty. */
const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : "")

/** "02:15 in America/Chicago, which is 00:15 in America/Los_Angeles" for the season-open run. */
function describePrepare(at: Date, now: number, server: string, zones: string[], opens: string): string {
  if (at.getTime() <= now) return "Not scheduled: the season has opened"
  const west = zones.find((zone) => instantToWallTime(at, zone).endsWith("T00:15"))
  const local = `${instantToWallTime(at, server).slice(11)} in ${server}`
  return west && west !== server ? `${local}, which is 00:15 in ${west}, on ${opens}` : `${local} on ${opens}`
}

export default async function RewindSeasonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { model: true } }),
    getRewindSeasonDataPreparedAt(year),
  ])
  const [preflight, counts, budget, all, failed, members, memberTotal] = await Promise.all([
    getRewindPreflight(),
    getSeasonCounts(year, now),
    getSeasonBudget(year),
    loadSeasonEstimate(year, through, "all"),
    loadSeasonEstimate(year, through, "failed"),
    listSeasonMembers(year, filters, table, now),
    prisma.user.count({ where: { disabledAt: null, plexUserId: { not: null } } }),
  ])

  const opensMd = config?.rewindSeasonOpens ?? "12-01"
  const prepareAt = seasonPrepareAt(year, opensMd, zones)
  const finalCutOpen = now >= finalCutOpensAt(year, zones).getTime()
  const lastDay = through.endsWith("12-31") ? "31 December" : "30 November"

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6" data-testid="admin-rewind-page">
      <PageHeader
        title="Season"
        description={`Rewind ${year}: prepare the season's data, generate every member's Rewind and follow the runs.`}
        actions={<SeasonActions year={year} estimates={{ all, failed }} finalCutNote={finalCutOpen ? "Arrives in a later release" : "Available from 1 January"} />}
        data-testid="admin-rewind-header"
      />
      <SeasonProgress year={year} initial={counts} budget={budget} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <SeasonPreflight rows={preflight} />
        <SeasonFacts
          opens={f.date(season.opensAt, "long")}
          closes={f.date(season.closesAt.getTime() - 1, "long")}
          dataWindow={`1 January to ${lastDay} ${year}, in each member's zone`}
          model={config?.llmDisabled || config?.rewindLlmMode === "off" ? "Template copy only" : (provider?.model ?? "None set")}
          promptVersion={PROMPT_VERSION}
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
