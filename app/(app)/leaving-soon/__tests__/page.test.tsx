/**
 * The member /leaving-soon route (UX 9.2, TS 13.3): signed out it goes home;
 * signed in it reads the member's own page data with the session's id, the
 * server name and the shortest grace period of the live rules, and hands
 * them to the page. The shortest grace skips Dry run rules and definitions
 * that do not parse. The loading state is a busy skeleton.
 */

import { render, screen } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { shortestGraceDays } from "@/app/(app)/leaving-soon/grace"
import LeavingSoonLoading from "@/app/(app)/leaving-soon/loading"
import LeavingSoonRoute from "@/app/(app)/leaving-soon/page"
import { LeavingSoonPage } from "@/components/leaving-soon/leaving-soon-page"
import { buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import type { MemberLeavingSoonData } from "@/lib/cleanup/types/member"
import { getLeavingSoonForMember } from "@/lib/data/leaving-soon"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/lib/data/leaving-soon", () => ({ getLeavingSoonForMember: jest.fn() }))
jest.mock("@/components/leaving-soon/leaving-soon-page", () => ({ LeavingSoonPage: jest.fn(() => <div data-testid="leaving-soon-page-stub" />) }))
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT")
  }),
}))

const DATA: MemberLeavingSoonData = {
  enabled: false, plexFailed: true, keeps: { enabled: true, limit: 20, used: 0, days: 90 }, forYou: [], groups: [], myKeeps: [],
}

type RuleRow = Awaited<ReturnType<typeof prismaMock.cleanupRule.findMany>>[number]
const rules = (...definitions: unknown[]) => definitions.map((definition) => ({ definition }) as RuleRow)

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1" } })
  jest.mocked(getLeavingSoonForMember).mockResolvedValue(DATA)
  prismaMock.cleanupRule.findMany.mockResolvedValue([])
})

describe("LeavingSoonRoute", () => {
  it("sends a signed-out visitor home", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(LeavingSoonRoute()).rejects.toThrow("NEXT_REDIRECT")
    expect(redirect).toHaveBeenCalledWith("/")
    expect(getLeavingSoonForMember).not.toHaveBeenCalled()
  })

  it("reads the member's own data and hands it to the page with the server name and the grace", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue(rules(buildDefinition({ then: { graceDays: 21, action: "movie.delete", importListExclusion: false } })))
    render(await LeavingSoonRoute())

    expect(screen.getByTestId("leaving-soon-page-stub")).toBeInTheDocument()
    expect(getLeavingSoonForMember).toHaveBeenCalledWith("member-1")
    expect(jest.mocked(LeavingSoonPage).mock.calls[0][0]).toEqual({ data: DATA, serverName: "Northfield Plex", graceDays: 21 })
  })

  it("passes no grace without a live rule", async () => {
    render(await LeavingSoonRoute())
    expect(jest.mocked(LeavingSoonPage).mock.calls[0][0].graceDays).toBeUndefined()
  })
})

describe("shortestGraceDays", () => {
  it("reads only the rules that are not in Dry run, and takes the shortest grace", async () => {
    const then = (graceDays: number) => buildDefinition({ then: { graceDays, action: "movie.delete", importListExclusion: false } })
    prismaMock.cleanupRule.findMany.mockResolvedValue(rules(then(30), then(14), { broken: true }, then(60)))

    await expect(shortestGraceDays()).resolves.toBe(14)
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith({ where: { mode: { not: "dryRun" } }, select: { definition: true } })
  })

  it("is null when no live rule has a definition that parses", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue(rules({ broken: true }))
    await expect(shortestGraceDays()).resolves.toBeNull()
  })
})

describe("LeavingSoonLoading", () => {
  it("is a busy skeleton with a name", () => {
    render(<LeavingSoonLoading />)
    const loading = screen.getByTestId("leaving-soon-loading")
    expect(loading).toHaveAttribute("aria-busy", "true")
    expect(loading).toHaveAttribute("aria-label", "Loading Leaving soon")
  })
})
