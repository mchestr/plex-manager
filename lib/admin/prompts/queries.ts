/**
 * Reads for the admin prompt pages (P10.4), for server code only: the list's
 * rows with the editor's name, one template's detail, and the line the "Use
 * for Rewind" confirm adds while the season is open.
 *
 * @module lib/admin/prompts/queries
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { formatDate, type FormatSettings } from "@/lib/utils/format"
import { getSeasonState } from "@/lib/wrapped/season"

export type PromptStatus = "inUse" | "notInUse" | "v2"

/** A list row: no template text crosses to the client table. */
export interface PromptRow {
  id: string
  name: string
  status: PromptStatus
  version: number
  length: number
  updatedAt: string
  updatedByName: string | null
}

export interface PromptDetail extends PromptRow {
  description: string | null
  kind: string
  template: string
  isActive: boolean
  createdAt: string
}

const select = {
  id: true,
  name: true,
  description: true,
  kind: true,
  template: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  updatedBy: true,
} as const satisfies Prisma.PromptTemplateSelect

/** A v2 template is never used, active or not; a style guide is in use while active. */
function promptStatus({ kind, isActive }: { kind: string; isActive: boolean }): PromptStatus {
  if (kind !== "rewind-style-guide") return "v2"
  return isActive ? "inUse" : "notInUse"
}

async function editorNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unique.length === 0) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name ?? "Unnamed member"]))
}

type Selected = Prisma.PromptTemplateGetPayload<{ select: typeof select }>

function toRow(row: Selected, names: Map<string, string>): PromptRow {
  return {
    id: row.id,
    name: row.name,
    status: promptStatus(row),
    version: row.version,
    length: row.template.length,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy ? (names.get(row.updatedBy) ?? null) : null,
  }
}

/** Every template: style guides first, the one in use on top, then the newest. */
export async function listPromptTemplates(): Promise<PromptRow[]> {
  const rows = await prisma.promptTemplate.findMany({
    select,
    orderBy: [{ kind: "desc" }, { isActive: "desc" }, { updatedAt: "desc" }],
  })
  const names = await editorNames(rows.map((r) => r.updatedBy))
  return rows.map((row) => toRow(row, names))
}

export async function getPromptTemplateDetail(id: string): Promise<PromptDetail | null> {
  const row = await prisma.promptTemplate.findUnique({ where: { id }, select })
  if (!row) return null
  return {
    ...toRow(row, await editorNames([row.updatedBy])),
    description: row.description,
    kind: row.kind,
    template: row.template,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}

/** The style guide in use, by name, for the activation confirm. */
export async function currentStyleGuideName(): Promise<string | null> {
  const row = await prisma.promptTemplate.findFirst({
    where: { kind: "rewind-style-guide", isActive: true },
    select: { name: true },
  })
  return row?.name ?? null
}

/** "Rewinds regenerated before Jan 31 will use this voice." while the season is open, else null. */
export async function seasonVoiceNote(settings: FormatSettings, now: Date = new Date()): Promise<string | null> {
  const season = await getSeasonState(now)
  if (!season.isOpen) return null
  // closesAt is the exclusive end; the last day is the millisecond before it.
  const lastDay = formatDate(new Date(season.closesAt.getTime() - 1), "day-month-short", settings)
  return `Rewinds regenerated before ${lastDay} will use this voice.`
}
