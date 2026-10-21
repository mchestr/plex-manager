/**
 * `/rewind/[year]?preview=<uuid>` (P7.10): admins open a dry run from Redis
 * as the story under a Preview banner; a member gets the route's 404, and an
 * unknown or expired id shows the `not-found` panel.
 */

import { render, screen } from "@testing-library/react"
import { getServerSession } from "next-auth"
import { notFound } from "next/navigation"

import RewindYearPage from "@/app/(app)/rewind/[year]/(story)/page"
import { stagePages, LLM_COPY } from "@/components/rewind/stage/__tests__/stage-fixture"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { minimalV3 } from "@/lib/wrapped/data/__tests__/v3-row"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => ({ prisma: {} }))
jest.mock("@/lib/brand", () => ({ rewindName: async (year: number) => `Rewind ${year}` }))
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  useRouter: () => ({ push: jest.fn() }),
}))
// The real store, on a Redis that holds one key.
const mockGet = jest.fn()
jest.mock("@/lib/queue/connection", () => ({ getRequestPathRedis: () => ({ get: mockGet }) }))
jest.mock("@/components/rewind/rewind-generating-watch", () => ({ RewindGeneratingWatch: () => null }))
// The real stage, on the stage fixture's pages, in the mode the issue passes it.
jest.mock("@/components/rewind/rewind-issue", () => ({
  RewindIssue: ({ preview, userId }: { preview?: boolean; userId: string }) => (
    <div data-testid="issue" data-user={userId}>
      <StoryStage
        pages={stagePages(["cover", "number", "back-cover"])}
        year={2026}
        archetype={null}
        closeHref="/"
        copy={LLM_COPY}
        mode={preview ? "preview" : "member"}
      />
    </div>
  ),
}))

const ID = "0b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a"

function signIn(isAdmin: boolean) {
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: isAdmin ? "admin-1" : "member-1", isAdmin } } as never)
}

/** What the dry-run job stores in Redis (the store parses it again on read). */
const completed = {
  status: "completed",
  subject: { kind: "member", userId: "member-7" },
  year: 2026,
  adminId: "admin-1",
  finishedAt: "2026-11-20T10:00:00.000Z",
  data: minimalV3(),
  trail: {},
}

async function renderPage(preview: string, year = "2026") {
  render(await RewindYearPage({ params: Promise.resolve({ year }), searchParams: Promise.resolve({ preview }) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockImplementation(async (key: string) => (key === `rw:preview:${ID}` ? JSON.stringify(completed) : null))
})

it("gives a member the 404 without reading the preview", async () => {
  signIn(false)
  await expect(renderPage(ID)).rejects.toThrow("NEXT_NOT_FOUND")
  expect(notFound).toHaveBeenCalled()
  expect(mockGet).not.toHaveBeenCalled()
})

it("shows an admin the dry run under the Preview banner, as the member it ran for, with no share pill", async () => {
  signIn(true)
  await renderPage(ID)
  expect(mockGet).toHaveBeenCalledWith(`rw:preview:${ID}`)
  expect(screen.getByTestId("issue")).toHaveAttribute("data-user", "member-7")
  expect(screen.getByTestId("rewind-preview-banner")).toHaveTextContent("Preview")
  expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-preview", "true")
  expect(screen.queryByTestId("rewind-share-slide")).not.toBeInTheDocument()
})

it("shows not-found for an expired id", async () => {
  signIn(true)
  mockGet.mockResolvedValueOnce(null)
  await renderPage(ID)
  expect(screen.getByTestId("rewind-status-panel")).toHaveAttribute("data-kind", "not-found")
  expect(screen.queryByTestId("issue")).not.toBeInTheDocument()
})

it.each([
  ["a malformed id", "../etc", "2026"],
  ["another year's run", ID, "2025"],
  ["a run that has not finished", "1b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a", "2026"],
])("shows not-found for %s", async (_name, preview, year) => {
  signIn(true)
  await renderPage(preview, year)
  expect(screen.getByTestId("rewind-status-panel")).toHaveAttribute("data-kind", "not-found")
})
