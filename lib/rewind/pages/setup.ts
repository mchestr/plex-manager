/**
 * 13 Setup (design 4.3, D5): how the member watched, in template copy only.
 * Three meters (direct play, at home as a percentage only, and 4K when the
 * cache knows resolutions) and the top platform as a nameplate with the top
 * app beneath it. Kept with 20 plays (`stats.devices.eligible`); a share of
 * 0% draws no meter. Second on the cut list; no share card (FR-18).
 *
 * The selector reads only `DeviceStats` and the `setup.*` facts, which come
 * from `PlayEvent`'s platform, product, transcode decision and location: it
 * has no player name, IP address or machine id to read (NFR-7).
 *
 * @module lib/rewind/pages/setup
 */

import { heading, tableBlock } from "@/lib/rewind/article/blocks"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { has, num, shown } from "./facts"
import { SETUP_METERS, SetupDataSchema, type SetupData } from "./setup.schema"

type MeterFact = (typeof SETUP_METERS)[number]

/** Each meter's label on the page and in the Table. */
export const METER_LABELS: Record<MeterFact, string> = {
  "setup.directPlayShare": "direct play",
  "setup.homeShare": "watched at home",
  "setup.fourKShare": "in 4K",
}

const SENTENCES: Record<MeterFact, (share: string) => string> = {
  "setup.directPlayShare": (share) => `${share} of your plays were direct play, with no transcoding.`,
  "setup.homeShare": (share) => `${share} were watched at home.`,
  "setup.fourKShare": (share) => `${share} were in 4K.`,
}

function setupSummary(data: SetupData, facts: RewindFactsV3): string {
  const parts = data.meters.map((id) => SENTENCES[id](shown(facts, id)))
  if (has(facts, "setup.topPlatform")) {
    const app = has(facts, "setup.topProduct") ? `, in ${shown(facts, "setup.topProduct")}` : ""
    parts.push(`Most of your viewing was on ${shown(facts, "setup.topPlatform")}${app}.`)
  }
  return parts.join(" ")
}

function setupTable(data: SetupData, facts: RewindFactsV3): PageTable | null {
  const rows = data.meters.map((id) => [METER_LABELS[id][0].toUpperCase() + METER_LABELS[id].slice(1), shown(facts, id)])
  if (has(facts, "setup.topPlatform")) rows.push(["Top platform", shown(facts, "setup.topPlatform")])
  if (has(facts, "setup.topProduct")) rows.push(["Top app", shown(facts, "setup.topProduct")])
  if (rows.length === 0) return null
  return {
    caption: "How you watched",
    columns: ["Measure", "Value"],
    rows,
  }
}

export const setupPage: PageDefinition<SetupData> = {
  select: (facts, { stats }) => {
    if (!stats.devices.eligible) return null
    const meters = SETUP_METERS.filter((id) => num(facts, id) > 0)
    return meters.length === 0 && !has(facts, "setup.topPlatform") ? null : { meters }
  },
  schema: SetupDataSchema,
  srSummary: setupSummary,
  table: (data, facts) => setupTable(data, facts),
  article: (data, facts) => [heading(headline("setup", facts), facts), ...tableBlock(setupTable(data, facts))],
  share: { facts: [] },
}
