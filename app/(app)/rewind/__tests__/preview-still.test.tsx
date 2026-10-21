/**
 * `page` and `still` on `/rewind/[year]` (P7.11): the gallery opens a dry run
 * on one page and settles it. Both work only with `?preview=`; on a member's
 * own issue they do nothing. The stage opens on the page and, when still,
 * neither plays nor animates.
 */

import { render, screen } from "@testing-library/react"
import { getServerSession } from "next-auth"

import RewindYearPage from "@/app/(app)/rewind/[year]/(story)/page"
import { RewindIssue } from "@/components/rewind/rewind-issue"
import { stagePages, LLM_COPY } from "@/components/rewind/stage/__tests__/stage-fixture"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { minimalV3 } from "@/lib/wrapped/data/__tests__/v3-row"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => ({ prisma: { plexWrapped: { findMany: async () => [] } } }))
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
const mockGet = jest.fn()
jest.mock("@/lib/queue/connection", () => ({ readyWithin: async () => true, getRequestPathRedis: () => ({ get: mockGet }) }))
jest.mock("@/lib/rewind/year-view", () => ({
  loadRewindYearView: async () => ({ kind: "issue", id: "wrapped-1", data: jest.requireActual("@/lib/wrapped/data/__tests__/v3-row").minimalV3() }),
}))
jest.mock("@/lib/wrapped/season", () => ({ listCompletedRewindYears: async () => [] }))
jest.mock("@/components/rewind/shared-years-notice", () => ({ RewindSharedYearsNotice: () => null }))
jest.mock("@/actions/rewind-notify", () => ({ notifyWhenRewindReady: jest.fn() }))
jest.mock("@/components/rewind/rewind-generating-watch", () => ({ RewindGeneratingWatch: () => null }))
jest.mock("@/components/rewind/rewind-issue", () => ({ RewindIssue: jest.fn(() => <div data-testid="issue" />) }))

const ID = "0b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a"

const completed = {
  status: "completed",
  subject: { kind: "fixture", fixtureId: "heavy" },
  year: 2026,
  adminId: "admin-1",
  finishedAt: "2026-11-20T10:00:00.000Z",
  data: minimalV3(),
  trail: {},
}

async function renderPage(query: Record<string, string>) {
  render(await RewindYearPage({ params: Promise.resolve({ year: "2026" }), searchParams: Promise.resolve(query) }))
}

const issueProps = () => jest.mocked(RewindIssue).mock.calls[0][0]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } } as never)
  mockGet.mockImplementation(async (key: string) => (key === `rw:preview:${ID}` ? JSON.stringify(completed) : null))
})

it("ignores page and still without preview", async () => {
  await renderPage({ page: "centrefold", still: "1" })
  expect(screen.getByTestId("issue")).toBeInTheDocument()
  expect(issueProps()).not.toHaveProperty("initialPage")
  expect(issueProps()).not.toHaveProperty("still")
  expect(issueProps().preview).toBeUndefined()
  expect(mockGet).not.toHaveBeenCalled()
})

it("passes page and still to a preview", async () => {
  await renderPage({ preview: ID, page: "centrefold", still: "1" })
  expect(issueProps()).toMatchObject({ preview: true, initialPage: "centrefold", still: true })
})

it("leaves a preview moving without still", async () => {
  await renderPage({ preview: ID, page: "centrefold" })
  expect(issueProps()).toMatchObject({ preview: true, initialPage: "centrefold", still: false })
})

describe("the stage", () => {
  const pages = stagePages(["cover", "number", "back-cover"])
  const stage = (props: { initialIndex?: number; still?: boolean }) => (
    <StoryStage pages={pages} year={2026} archetype={null} closeHref="/" copy={LLM_COPY} mode="preview" {...props} />
  )

  it("opens on the page and holds it, paused, when still", () => {
    render(stage({ initialIndex: 1, still: true }))
    const root = screen.getByTestId("rewind-stage")
    expect(root).toHaveAttribute("data-still", "true")
    expect(root).toHaveAttribute("data-mode", "paused")
    expect(document.querySelector("[data-current]")).toHaveAttribute("data-index", "1")
  })

  it("opens on the cover by default", () => {
    render(stage({}))
    const root = screen.getByTestId("rewind-stage")
    expect(root).not.toHaveAttribute("data-still")
    expect(root).toHaveAttribute("data-mode", "cover")
  })
})
