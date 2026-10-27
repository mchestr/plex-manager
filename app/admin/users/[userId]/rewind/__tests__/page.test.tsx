/**
 * The admin Rewind preview (P7.9): admins only, the stage framed in
 * admin-preview mode under the banner, status panels with the typed code,
 * and one `REWIND_ADMIN_VIEWED` audit entry for each render of a stored Rewind.
 */

import { render, screen } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"
import { notFound } from "next/navigation"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildUser } from "@/__tests__/helpers/factories"
import AdminUserRewindPage from "@/app/admin/users/[userId]/rewind/[year]/page"
import { stagePages, LLM_COPY } from "@/components/rewind/stage/__tests__/stage-fixture"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { getAdminGate } from "@/lib/admin"
import { findRollbackTarget } from "@/lib/rewind/rollback"
import { loadRewindYearView, type RewindYearView } from "@/lib/rewind/year-view"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { minimalV3 } from "@/lib/wrapped/data/__tests__/v3-row"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ getAdminGate: jest.fn() }))
jest.mock("@/lib/rewind/year-view", () => ({ loadRewindYearView: jest.fn() }))
jest.mock("@/lib/rewind/rollback", () => ({ findRollbackTarget: jest.fn() }))
jest.mock("@/lib/rewind/fonts", () => ({ rewindFontVariables: "rw-fonts" }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
// `after()` runs its callback once the response is sent; here, at once.
jest.mock("next/server", () => ({ after: (fn: () => void) => fn() }))
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock("@/components/rewind/rewind-generating-watch", () => ({ RewindGeneratingWatch: () => null }))
jest.mock("@/components/admin/rewind/rewind-preview-actions", () => ({ RewindPreviewActions: () => null }))
jest.mock("@/components/admin/rewind/admin-rewind-article", () => ({ AdminRewindArticle: () => <div data-testid="article" /> }))
jest.mock("@/components/rewind/article/archive-article", () => ({ ArchiveArticle: () => <div data-testid="legacy" /> }))
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Test Server") }))
jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn().mockResolvedValue({ locale: "en-US" }) }))
// The real stage, on the stage fixture's pages, in the mode the issue passes it.
jest.mock("@/components/rewind/rewind-issue", () => ({
  RewindIssue: ({ adminPreview, ownRewindHref }: { adminPreview?: boolean; ownRewindHref?: string }) => (
    <>
      <span data-testid="rewind-issue-props" data-own={ownRewindHref} />
      <StoryStage
        pages={stagePages(["cover", "number", "back-cover"])}
        year={2026}
        archetype={null}
        closeHref="/admin/users/member-1"
        copy={LLM_COPY}
        mode={adminPreview ? "admin-preview" : "member"}
      />
    </>
  ),
}))

const ADMIN_SESSION = { user: { id: "admin-1", isAdmin: true } }

async function renderPage(search: Record<string, string> = {}, year = "2026") {
  const ui = await AdminUserRewindPage({
    params: Promise.resolve({ userId: "member-1", year }),
    searchParams: Promise.resolve(search),
  })
  return render(<>{ui}</>)
}

function showView(view: RewindYearView) {
  jest.mocked(loadRewindYearView).mockResolvedValue(view)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getAdminGate).mockResolvedValue({ ok: true, session: ADMIN_SESSION } as never)
  jest.mocked(findRollbackTarget).mockResolvedValue({ ok: false, reason: "NO_PREVIOUS" })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", name: "Morgan Lee", plexUserId: "plex-7" }))
  prismaMock.plexWrapped.findUnique.mockResolvedValue({ id: "wrapped-1", edition: "full" } as never)
})

it("shows a non-admin the admins-only screen and reads nothing", async () => {
  jest.mocked(getAdminGate).mockResolvedValue({ ok: false, reason: "forbidden" })
  await renderPage()
  expect(screen.getByTestId("unauthorized-error-page")).toBeInTheDocument()
  expect(loadRewindYearView).not.toHaveBeenCalled()
  expect(logAuditEvent).not.toHaveBeenCalled()
})

it("404s a year outside 2010 to 2100", async () => {
  await expect(renderPage({}, "1999")).rejects.toThrow("NEXT_NOT_FOUND")
  expect(notFound).toHaveBeenCalled()
})

it("renders a v3 row as the framed stage in admin-preview mode, under the banner, with no share controls", async () => {
  showView({ kind: "issue", id: "wrapped-1", data: minimalV3() as unknown as RewindDataV3 })
  await renderPage()

  expect(loadRewindYearView).toHaveBeenCalledWith({ userId: "member-1", isAdmin: true }, 2026)
  expect(screen.getByTestId("admin-rewind-preview-banner")).toHaveTextContent(
    "You are viewing Morgan Lee's Rewind as an admin. Members are told that admins can view their Rewind."
  )
  expect(screen.getByTestId("admin-rewind-preview-header")).toHaveTextContent("Users/Morgan Lee/Rewind 2026")
  const stage = screen.getByTestId("rewind-stage")
  expect(screen.getByTestId("admin-rewind-preview-frame")).toContainElement(stage)
  expect(stage).toHaveAttribute("data-preview", "true")
  expect(stage).toHaveClass("absolute")
  expect(screen.queryByTestId("rewind-preview-banner")).not.toBeInTheDocument()
  expect(screen.queryByTestId("rewind-share-slide")).not.toBeInTheDocument()
  // Admin preview writes no view: the only write is the audit entry.
  expect(prismaMock.rewindView.create).not.toHaveBeenCalled()
  expect(prismaMock.rewindView.upsert).not.toHaveBeenCalled()
  expect(logAuditEvent).toHaveBeenCalledTimes(1)
  expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.REWIND_ADMIN_VIEWED, "admin-1", {
    targetUserId: "member-1",
    year: 2026,
    wrappedId: "wrapped-1",
  })
})

it("links the preview's share sheet to the admin's own Rewind only when it is theirs", async () => {
  showView({ kind: "issue", id: "wrapped-1", data: minimalV3() as unknown as RewindDataV3 })
  const { unmount } = await renderPage()
  expect(screen.getByTestId("rewind-issue-props")).not.toHaveAttribute("data-own")
  unmount()

  jest.mocked(getAdminGate).mockResolvedValue({ ok: true, session: { user: { id: "member-1", isAdmin: true } } } as never)
  await renderPage()
  expect(screen.getByTestId("rewind-issue-props")).toHaveAttribute("data-own", "/rewind/2026?sheet=share")
})

it("reads the issue as an article with ?view=article", async () => {
  showView({ kind: "issue", id: "wrapped-1", data: minimalV3() as unknown as RewindDataV3 })
  await renderPage({ view: "article" })
  expect(screen.getByTestId("article")).toBeInTheDocument()
  expect(screen.queryByTestId("rewind-stage")).not.toBeInTheDocument()
})

it("shows a failed row's typed code and hint, never the member's generating screen, and audits each render", async () => {
  showView({ kind: "panel", panel: "failed", code: "TAUTULLI_USER_NOT_FOUND" })
  await renderPage()
  await renderPage()

  const panels = screen.getAllByTestId("rewind-status-panel")
  expect(panels[0]).toHaveAttribute("data-kind", "failed")
  expect(screen.getAllByTestId("admin-rewind-preview-code")[0]).toHaveTextContent("TAUTULLI_USER_NOT_FOUND")
  expect(screen.getAllByTestId("admin-rewind-preview-hint")[0]).toHaveTextContent("Plex user plex-7")
  expect(screen.queryByTestId("rewind-status-back")).not.toBeInTheDocument()
  expect(logAuditEvent).toHaveBeenCalledTimes(2)
  expect(logAuditEvent).toHaveBeenNthCalledWith(2, AuditEventType.REWIND_ADMIN_VIEWED, "admin-1", expect.objectContaining({ wrappedId: "wrapped-1" }))
})

it("writes no audit entry when the member has no row for the year", async () => {
  prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
  showView({ kind: "panel", panel: "not-found", code: "REWIND_NOT_FOUND" })
  await renderPage()
  expect(screen.getByTestId("rewind-status-panel")).toHaveAttribute("data-kind", "not-found")
  expect(logAuditEvent).not.toHaveBeenCalled()
})

it("shows v1 and v2 years as the archive article", async () => {
  showView({ kind: "legacy", data: {} as never })
  await renderPage({}, "2024")
  expect(screen.getByTestId("legacy")).toBeInTheDocument()
})
