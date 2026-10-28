import type { Metadata, Route } from "next"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"

import { AdminRewindArticle } from "@/components/admin/rewind/admin-rewind-article"
import { RewindPreviewActions } from "@/components/admin/rewind/rewind-preview-actions"
import { ArchiveArticle } from "@/components/rewind/article/archive-article"
import { RewindIssue } from "@/components/rewind/rewind-issue"
import { RewindStatusPanel } from "@/components/rewind/rewind-status-panel"
import { RewindScope } from "@/components/rewind/stage/rewind-scope"
import { AdminDenial } from "@/components/shell/admin-denial"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { getAdminGate } from "@/lib/admin"
import { userDetail, userRewind } from "@/lib/admin/routes"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { rewindFontVariables } from "@/lib/rewind/fonts"
import { findRollbackTarget } from "@/lib/rewind/rollback"
import { getAppSettings } from "@/lib/settings/app-settings"
import { loadRewindYearView, type RewindYearView } from "@/lib/rewind/year-view"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { recordIdSchema } from "@/lib/validations/params"
import { adminErrorHint } from "@/lib/wrapped/generation-errors"

export const metadata: Metadata = { robots: { index: false } }

const ParamsSchema = z.object({
  userId: recordIdSchema,
  year: z.coerce.number().int().min(2010).max(2100),
})

type PreviewPageProps = {
  params: Promise<{ userId: string; year: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const EDITIONS: Record<string, string> = { full: "Full edition", pocket: "Pocket edition", postcard: "Postcard" }
const COPY_SOURCES: Record<string, string> = { llm: "AI copy", repair: "AI copy, repaired", mixed: "Mixed copy", template: "Template copy" }

/** The view's state as the season console's status vocabulary. */
function ViewStatus({ view }: { view: RewindYearView }) {
  if (view.kind !== "panel") return <StatusBadge domain="rewind" value="ready" sub="" />
  switch (view.panel) {
    case "generating":
      return <StatusBadge domain="rewind" value="generating" sub="" />
    case "failed":
      return <StatusBadge domain="rewind" value="failed" sub="" />
    case "not-eligible":
      return <StatusBadge domain="rewind" value="notEligible" sub="" />
    case "not-found":
      return <StatusBadge domain="rewind" value="notStarted" sub="" />
    case "unavailable":
      return <StatusBadge tone="warning" label="Unavailable" />
    case "parse-error":
      return <StatusBadge tone="destructive" label="Unreadable" />
  }
}

/**
 * One member's Rewind in the admin shell (P7.9, UI-06, GAP-33): the year in
 * the path, a "viewing as an admin" banner, the story framed in the Rewind
 * scope in admin-preview mode (no views, sharing or hiding), and status
 * panels with the typed code instead of the member's generating screen.
 * Each render of a stored Rewind writes `REWIND_ADMIN_VIEWED`.
 */
export default async function AdminUserRewindPage({ params, searchParams }: PreviewPageProps) {
  const gate = await getAdminGate()
  if (!gate.ok) return <AdminDenial reason={gate.reason} />

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  const { userId, year } = parsed.data

  const [user, row] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, plexUserId: true } }),
    prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true, edition: true } }),
  ])
  if (!user) notFound()
  const name = user.name || user.email || "Member"

  const [view, rollback, brand, settings] = await Promise.all([
    loadRewindYearView({ userId, isAdmin: true }, year),
    findRollbackTarget(userId, year),
    serverName(),
    getAppSettings(),
  ])

  if (row) {
    const adminId = gate.session.user.id
    after(() => logAuditEvent(AuditEventType.REWIND_ADMIN_VIEWED, adminId, { targetUserId: userId, year, wrappedId: row.id }))
  }

  const here = userRewind(userId, year)
  // An admin shares their own Rewind from the member view; the preview's share sheet links there.
  const ownRewindHref = userId === gate.session.user.id ? (`/rewind/${year}?sheet=share` as Route) : undefined
  const reading = view.kind === "issue" && (await searchParams).view === "article"
  const articleHref = `${here}?view=article` as Route
  const toggle = view.kind === "issue" ? (reading ? { href: here, label: "Play the story" } : { href: articleHref, label: "Read as an article" }) : null
  const edition = view.kind === "issue" ? view.data.edition : row?.edition
  const copySource = view.kind === "issue" ? view.data.copySource : null
  const hint =
    view.kind === "panel" && (view.code === "TAUTULLI_USER_NOT_FOUND" || view.code === "REWIND_NOT_ELIGIBLE")
      ? adminErrorHint(view.code, user.plexUserId)
      : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6" data-testid="admin-rewind-preview">
      <PageHeader
        title={`Rewind ${year}`}
        breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: name, href: userDetail(userId) }, { label: `Rewind ${year}` }]}
        meta={
          <>
            <ViewStatus view={view} />
            {edition && <Badge variant="outline">{EDITIONS[edition] ?? edition}</Badge>}
            {copySource && <Badge variant="outline">{COPY_SOURCES[copySource] ?? copySource}</Badge>}
          </>
        }
        actions={
          <RewindPreviewActions userId={userId} year={year} name={name} rollback={rollback.ok ? { from: rollback.from } : null} toggle={toggle} />
        }
        data-testid="admin-rewind-preview-header"
      />
      <Alert tone="info" data-testid="admin-rewind-preview-banner">
        You are viewing {name}&apos;s Rewind as an admin. The app tells members that admins can view their Rewind.
      </Alert>
      <RewindScope fontClassName={rewindFontVariables}>
        {view.kind === "issue" ? (
          reading ? (
            <div className="overflow-hidden rounded-lg border border-border" data-testid="admin-rewind-preview-article">
              <AdminRewindArticle data={view.data} userId={userId} />
            </div>
          ) : (
            <div
              className="relative mx-auto aspect-9/16 h-[min(52.75rem,calc(100dvh-16rem))] min-h-96 max-w-full overflow-hidden rounded-lg border border-border"
              data-testid="admin-rewind-preview-frame"
            >
              <RewindIssue
                rewindId={view.id}
                data={view.data}
                userId={userId}
                returnTo={userDetail(userId)}
                articleHref={articleHref}
                ownRewindHref={ownRewindHref}
                adminPreview
              />
            </div>
          )
        ) : view.kind === "legacy" ? (
          // v1 and v2 read as P7.13's archive article
          <div className="overflow-hidden rounded-lg border border-border" data-testid="admin-rewind-preview-legacy">
            <ArchiveArticle legacy={view.data} year={year} brand={brand} locale={settings.locale} />
          </div>
        ) : (
          <div className="min-h-96 overflow-hidden rounded-lg border border-border" data-testid="admin-rewind-preview-status">
            <RewindStatusPanel kind={view.panel} code={view.code} year={year} returnTo={userDetail(userId)} audience="admin" embedded>
              <p className="font-mono text-label" data-testid="admin-rewind-preview-code">
                {view.code}
              </p>
              {hint && (
                <p className="text-body" data-testid="admin-rewind-preview-hint">
                  {hint}
                </p>
              )}
            </RewindStatusPanel>
          </div>
        )}
      </RewindScope>
    </div>
  )
}
