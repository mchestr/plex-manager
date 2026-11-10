/**
 * The turn-on page (UX 4.6, TS 12.2): its own admin check before any read,
 * `?mode=automatic` passed to the loader, the view with the job queue state,
 * and a 404 for a rule that does not exist.
 */

import { render, screen } from "@testing-library/react"

import CleanupTurnOnPage from "@/app/admin/(automations)/cleanup/rules/[id]/turn-on/page"
import { turnOnData } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import type { TurnOnViewProps } from "@/components/admin/cleanup/turn-on/turn-on-view"
import { assertAdmin } from "@/lib/admin"
import { getCleanupTurnOn } from "@/lib/data/cleanup-turn-on"
import { isRedisConfigured } from "@/lib/queue/connection"

jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn().mockResolvedValue(undefined) }))
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/cleanup-turn-on", () => ({ getCleanupTurnOn: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/components/admin/cleanup/turn-on/turn-on-view", () => ({
  TurnOnView: ({ data, redis }: TurnOnViewProps) => (
    <p data-testid="view">
      {data.rule.name} {redis ? "queue" : "no queue"}
    </p>
  ),
}))

const DATA = turnOnData()
const page = (query: Record<string, string> = {}) => CleanupTurnOnPage({ params: Promise.resolve({ id: "rule-1" }), searchParams: Promise.resolve(query) })

beforeEach(() => {
  jest.mocked(assertAdmin).mockReset()
  jest.mocked(getCleanupTurnOn).mockReset().mockResolvedValue(DATA)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
})

it("checks the admin before it reads, and renders the view in the page container", async () => {
  render(await page())

  expect(assertAdmin).toHaveBeenCalled()
  expect(jest.mocked(assertAdmin).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(getCleanupTurnOn).mock.invocationCallOrder[0])
  expect(getCleanupTurnOn).toHaveBeenCalledWith("rule-1", undefined)
  expect(screen.getByTestId("admin-cleanup-turn-on-page")).toContainElement(screen.getByTestId("view"))
  expect(screen.getByTestId("view")).toHaveTextContent("Movies nobody watches queue")
})

it("preselects Automatic only for ?mode=automatic, and passes the job queue state", async () => {
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  render(await page({ mode: "automatic" }))
  expect(getCleanupTurnOn).toHaveBeenCalledWith("rule-1", "automatic")
  expect(screen.getByTestId("view")).toHaveTextContent("no queue")

  await page({ mode: "dryRun" })
  expect(getCleanupTurnOn).toHaveBeenLastCalledWith("rule-1", undefined)
})

it("is a 404 for a rule that does not exist", async () => {
  jest.mocked(getCleanupTurnOn).mockResolvedValue(null)
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND")
})

it("reads nothing when the admin check refuses", async () => {
  jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))
  await expect(page()).rejects.toThrow("PM_FORBIDDEN")
  expect(getCleanupTurnOn).not.toHaveBeenCalled()
})
