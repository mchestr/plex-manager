/**
 * The admin Problem reports pages' loaders (docs/problem-reports.md), admins
 * only: the list by filter with each filter's count, one report with its
 * timeline, and the settings card. Reports carry members' words, so the list
 * is audited once per admin and hour (`MEMBER_CONTENT_LISTED`), and a report
 * once per member whose words it shows (`MEMBER_CONTENT_VIEWED`), both with
 * the surface `problem-reports`.
 *
 * @module lib/data/problem-reports
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { FILTER_STATUSES, filterCounts, otherReporters, timelineStep, type Person, type TimelineStep } from "@/lib/admin/problem-reports/rows"
import type { ProblemReportFilter } from "@/lib/admin/routes"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import type { MediaType, ProblemReportStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { problemLabel } from "@/lib/problem-reports/taxonomy"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { reportTitle } from "@/lib/problem-reports/title"
import { AuditEventType, auditMemberListed, auditMemberRead } from "@/lib/security/audit-log"
import type { LastSaved } from "@/lib/settings/audit-meta"
import { plexItemHref } from "@/lib/ui/plex-links"

const personSelect = { id: true, name: true, email: true } as const
const person = (user: { id: string; name: string | null; email: string | null }): Person => ({ id: user.id, name: user.name || user.email || "Unknown member" })

export interface ProblemReportRow {
  id: string
  title: string
  problem: string
  reporter: Person
  /** Other members who reported or follow the title. */
  others: number
  status: ProblemReportStatus
  createdAt: Date
  updatedAt: Date
}

export interface ProblemReportList {
  rows: ProblemReportRow[]
  counts: Record<ProblemReportFilter, number>
  /** The filter's reports on every page. */
  total: number
}

/** One page of a filter's reports: Needs you oldest first, the rest newest first. */
export async function listProblemReports(filter: ProblemReportFilter, { page, pageSize }: { page: number; pageSize: number }): Promise<ProblemReportList> {
  const session = await assertAdmin()
  await auditMemberListed("problem-reports", session.user.id, { status: filter })
  const [rows, grouped] = await Promise.all([
    prisma.problemReport.findMany({
      where: { status: { in: [...FILTER_STATUSES[filter]] } },
      orderBy: filter === "needs-you" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, problem: true, status: true, title: true, year: true, showTitle: true, seasonNumber: true, episodeNumber: true,
        createdAt: true, updatedAt: true, reporterId: true, reporter: { select: personSelect },
        events: { where: { kind: "ALSO_REPORTED" }, select: { actorUserId: true } },
      },
    }),
    prisma.problemReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const counts = filterCounts(Object.fromEntries(grouped.map((group) => [group.status, group._count._all])))
  return {
    rows: rows.map((row) => ({
      id: row.id,
      title: reportTitle(row),
      problem: problemLabel(row.problem),
      reporter: person(row.reporter),
      others: otherReporters(row.reporterId, row.events.map((event) => event.actorUserId)),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    counts,
    total: counts[filter],
  }
}

export interface ProblemReportDetail {
  id: string
  title: string
  mediaType: MediaType
  problem: string
  /** The reporter's own words, shown as plain text. */
  note: string | null
  status: ProblemReportStatus
  /** Still open: Mark fixed and Close apply. */
  open: boolean
  reporter: Person
  createdAt: Date
  resolvedAt: Date | null
  /** The note the reporter sees, and the internal one. */
  memberNote: string | null
  adminNote: string | null
  /** The title in the server's Plex web app, when the server is known. */
  plexHref: string | null
  steps: TimelineStep[]
}

/** One report with its timeline, or null when there is none with this id. */
export async function getProblemReport(id: string): Promise<ProblemReportDetail | null> {
  const session = await assertAdmin()
  const [report, server] = await Promise.all([
    prisma.problemReport.findUnique({
      where: { id },
      select: {
        id: true, problem: true, note: true, status: true, activeKey: true, mediaType: true, plexRatingKey: true, title: true, year: true,
        showTitle: true, seasonNumber: true, episodeNumber: true, memberNote: true, adminNote: true, createdAt: true, resolvedAt: true,
        reporterId: true, reporter: { select: personSelect },
        events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, kind: true, data: true, createdAt: true, actor: { select: personSelect } } },
      },
    }),
    getActivePlexServerConfig(),
  ])
  if (!report) return null

  const speakers = new Set([report.reporterId, ...report.events.flatMap((event) => (event.kind === "ALSO_REPORTED" && event.actor ? [event.actor.id] : []))])
  speakers.delete(session.user.id)
  await Promise.all([...speakers].map((memberId) => auditMemberRead("problem-reports", memberId, session.user.id)))

  return {
    id: report.id,
    title: reportTitle(report),
    mediaType: report.mediaType,
    problem: problemLabel(report.problem),
    note: report.note,
    status: report.status,
    open: report.activeKey !== null,
    reporter: person(report.reporter),
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt,
    memberNote: report.memberNote,
    adminNote: report.adminNote,
    plexHref: plexItemHref(server?.machineIdentifier ?? null, report.plexRatingKey),
    steps: report.events.map((event) => timelineStep({ ...event, actor: event.actor && person(event.actor) })),
  }
}

/** The settings card: the switch, and its newest audited save. */
export async function getProblemReportSettingsView(): Promise<{ enabled: boolean; lastSaved: LastSaved | null }> {
  await assertAdmin()
  const [settings, row] = await Promise.all([
    getProblemReportSettings(),
    prisma.auditLog.findFirst({
      where: { type: AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorUserId: true, createdAt: true },
    }),
  ])
  if (!row) return { enabled: settings.enabled, lastSaved: null }
  const actor = await prisma.user.findUnique({ where: { id: row.actorUserId }, select: { name: true, email: true } })
  return { enabled: settings.enabled, lastSaved: { at: row.createdAt, by: actor?.name || actor?.email || "an admin", eventId: row.id } }
}
