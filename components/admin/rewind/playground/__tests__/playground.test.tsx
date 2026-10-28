/**
 * The playground's run flow (P8.8): a paid run shows its estimate in a
 * confirm first, a free one starts at once, and a completed run puts its id
 * in the address as `preview`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { estimateRewindDryRun, getRewindDryRun, startRewindDryRun } from "@/actions/admin/rewind-playground"
import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { Playground } from "@/components/admin/rewind/playground/playground"
import type { PlaygroundOptions } from "@/components/admin/rewind/playground/playground-form"
import { DEFAULT_MODEL, type PlaygroundForm } from "@/components/admin/rewind/playground/use-playground"
import heavy from "@/e2e/fixtures/rewind/heavy.v3.json"
import type { RewindDryRunState } from "@/actions/admin/rewind-playground"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/admin/rewind-playground", () => ({
  estimateRewindDryRun: jest.fn(),
  startRewindDryRun: jest.fn(),
  getRewindDryRun: jest.fn(),
}))

const estimate = jest.mocked(estimateRewindDryRun)
const start = jest.mocked(startRewindDryRun)
const poll = jest.mocked(getRewindDryRun)

const PREVIEW_ID = "7d4f9a52-3b1e-4c8a-9f20-1a2b3c4d5e6f"

const options: PlaygroundOptions = {
  members: [{ id: "cluser0000000000000000001", name: "Sam" }],
  fixtures: [{ id: "heavy", year: 2026 }, { id: "hostile-titles", year: 2026 }],
  memberYear: 2026,
  provider: { provider: "anthropic", model: "claude-sonnet-5-5" },
  models: [{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }],
  replay: false,
  promptVersions: ["rewind-2026.1"],
  efforts: ["low", "medium"],
}

const form: PlaygroundForm = {
  subject: "fixture",
  fixtureId: "hostile-titles",
  userId: "cluser0000000000000000001",
  model: DEFAULT_MODEL,
  promptVersion: "rewind-2026.1",
  effort: "low",
  copyPolicy: "default",
}

const base = { subject: { kind: "fixture" as const, fixtureId: "hostile-titles" }, year: 2026, adminId: "a1", finishedAt: "2026-12-08T10:00:00.000Z" }
const completed: RewindDryRunState = { ...base, status: "completed", data: RewindDataV3.parse(heavy), trail: {} }
const timedOut: RewindDryRunState = { ...base, status: "failed", code: "TIMEOUT" }

function renderPlayground() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Playground initialForm={form} options={options} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/rewind/playground")
})

describe("Playground", () => {
  it("shows a paid run's estimate first, then starts, polls and opens the preview", async () => {
    const user = userEvent.setup()
    estimate.mockResolvedValue({ success: true, data: { llm: true, provider: "anthropic", model: "claude-sonnet-5-5", costUsd: 0.021, maxCostUsd: 0.034 } })
    start.mockResolvedValue({ success: true, data: { previewId: PREVIEW_ID } })
    poll.mockResolvedValue({ success: true, data: completed })
    renderPlayground()

    await user.click(screen.getByTestId("playground-run"))
    expect(await screen.findByTestId("playground-estimate")).toHaveTextContent("about $0.021, at most $0.034")
    expect(start).not.toHaveBeenCalled()

    await user.click(screen.getByTestId("playground-estimate-confirm"))
    expect(start).toHaveBeenCalledWith({ subject: { kind: "fixture", fixtureId: "hostile-titles" }, year: 2026, effort: "low", copyPolicy: "default" })
    await waitFor(() => expect(currentHref()).toBe(`/admin/rewind/playground?preview=${PREVIEW_ID}`))
    expect(poll).toHaveBeenCalledWith({ id: PREVIEW_ID })
  })

  it("starts a free run without a confirm", async () => {
    const user = userEvent.setup()
    estimate.mockResolvedValue({ success: true, data: { llm: false, costUsd: 0, maxCostUsd: 0 } })
    start.mockResolvedValue({ success: true, data: { previewId: PREVIEW_ID } })
    poll.mockResolvedValue({ success: true, data: completed })
    renderPlayground()

    await user.click(screen.getByTestId("playground-run"))
    await waitFor(() => expect(start).toHaveBeenCalled())
    expect(screen.queryByTestId("playground-estimate")).not.toBeInTheDocument()
  })

  it("shows the rate limit or a failed run as an alert", async () => {
    const user = userEvent.setup()
    estimate.mockResolvedValue({ success: true, data: { llm: false, costUsd: 0, maxCostUsd: 0 } })
    start.mockResolvedValue({ success: false, code: "RATE_LIMITED", error: "Too many dry runs. Try again in a few minutes." })
    renderPlayground()

    await user.click(screen.getByTestId("playground-run"))
    expect(await screen.findByTestId("playground-failed")).toHaveTextContent("Too many dry runs")

    start.mockResolvedValue({ success: true, data: { previewId: PREVIEW_ID } })
    poll.mockResolvedValue({ success: true, data: timedOut })
    await user.click(screen.getByTestId("playground-run"))
    expect(await screen.findByTestId("playground-failed")).toHaveTextContent("The dry run failed: TIMEOUT")
  })
})
