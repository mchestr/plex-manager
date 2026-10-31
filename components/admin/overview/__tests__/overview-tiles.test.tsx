/**
 * The Overview tiles (P10.8): the words carry the state without colour, each
 * tile links to the page that fixes it, and a failed source is a dash.
 */

import { render, screen } from "@testing-library/react"

import { QueuesTile } from "@/components/admin/overview/queues-tile"
import { RewindTile } from "@/components/admin/overview/rewind-tile"
import { serviceHref, serviceProblem, ServicesTile } from "@/components/admin/overview/services-tile"
import { SpendTile } from "@/components/admin/overview/spend-tile"
import type { QueuesSummary, RewindSummary, ServicesSummary, SpendSummary } from "@/lib/admin/overview"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "America/Los_Angeles", locale: "en-US" })

const SERVICES: ServicesSummary = {
  working: 5,
  total: 6,
  attention: 0,
  broken: 1,
  worst: { id: "tautulli", label: "Tautulli", status: "unreachable" },
}
const QUEUES: QueuesSummary = { redisConfigured: true, redisConnected: true, workerRunning: true, failed: 0, waiting: 3 }
const REWIND: RewindSummary = {
  year: 2026,
  isOpen: true,
  opensAt: new Date("2026-12-01T08:00:00Z"),
  ready: 64,
  generating: 2,
  failed: 1,
  notStarted: 3,
  members: 70,
  opened: 51,
}
const SPEND: SpendSummary = {
  month: { from: "2026-12-01", to: "2026-12-10" },
  monthUsd: 1.25,
  seasonYear: 2026,
  seasonSpentUsd: 4.2,
  budgetUsd: 10,
}

const tile = (id: string) => screen.getByTestId(`admin-overview-${id}`)

describe("ServicesTile", () => {
  it("reads 5 of 6 working, names the worst service and links to its section", () => {
    render(<ServicesTile services={SERVICES} f={f} />)

    expect(tile("services")).toHaveTextContent("5of 6 working")
    expect(tile("services")).toHaveTextContent("Tautulli can't connect")
    expect(tile("services")).toHaveAttribute("href", "/admin/settings#tautulli")
    expect(screen.getByRole("img", { name: "5 working, 0 need attention, 1 not working" })).toBeInTheDocument()
  })

  it("says All working when nothing is wrong", () => {
    render(<ServicesTile services={{ ...SERVICES, working: 6, broken: 0, worst: null }} f={f} />)

    expect(tile("services")).toHaveTextContent("All working")
    expect(tile("services")).toHaveAttribute("href", "/admin/settings")
  })

  it("words each problem and sends Redis to the queues page", () => {
    expect(serviceProblem({ id: "ai", label: "AI", status: "degraded" })).toBe("AI uses template text")
    expect(serviceProblem({ id: "plex", label: "Plex", status: "incomplete" })).toBe("Plex needs setup")
    expect(serviceHref({ id: "redis", label: "Redis", status: "unreachable" })).toBe("/admin/queues")
    expect(serviceHref({ id: "database", label: "Database", status: "unreachable" })).toBe("/admin/settings")
  })
})

describe("QueuesTile", () => {
  it("reads All clear with the worker and the waiting jobs", () => {
    render(<QueuesTile queues={QUEUES} f={f} />)

    expect(tile("queues")).toHaveTextContent("All clear")
    expect(tile("queues")).toHaveTextContent("Worker running, 3 waiting")
    expect(tile("queues")).toHaveAttribute("href", "/admin/queues")
  })

  it("counts failed jobs and links to them, and says Worker stopped in words", () => {
    render(<QueuesTile queues={{ ...QUEUES, failed: 4, workerRunning: false }} f={f} />)

    expect(tile("queues")).toHaveTextContent("4failed")
    expect(tile("queues")).toHaveTextContent("Worker stopped, 3 waiting")
    expect(tile("queues")).toHaveAttribute("href", "/admin/queues?status=failed")
  })

  it("is a dash with Redis unreachable when Redis does not answer", () => {
    render(<QueuesTile queues={{ ...QUEUES, redisConnected: false, workerRunning: false, failed: null, waiting: null }} f={f} />)

    expect(screen.getByRole("img", { name: "Not available" })).toBeInTheDocument()
    expect(tile("queues")).toHaveTextContent("Redis unreachable")
  })

  it("says Redis is not set up without REDIS_URL", () => {
    render(<QueuesTile queues={{ ...QUEUES, redisConfigured: false, redisConnected: false, failed: null, waiting: null }} f={f} />)

    expect(tile("queues")).toHaveTextContent("Redis not set up")
  })
})

describe("RewindTile", () => {
  it("reads 64 of 70 ready with the openers and a meter of states", () => {
    render(<RewindTile rewind={REWIND} f={f} />)

    expect(tile("rewind")).toHaveTextContent("Rewind 2026")
    expect(tile("rewind")).toHaveTextContent("64of 70 ready")
    expect(tile("rewind")).toHaveTextContent("Opened by 51 members")
    expect(tile("rewind")).toHaveAttribute("href", "/admin/rewind")
    expect(screen.getByRole("img", { name: "64 ready, 2 generating, 1 failed, 3 not started" })).toBeInTheDocument()
  })

  it("shows the opening date outside the season, with last season as the unit", () => {
    render(<RewindTile rewind={{ ...REWIND, isOpen: false, year: 2025, opensAt: new Date("2026-12-01T08:00:00Z") }} f={f} />)

    expect(tile("rewind")).toHaveTextContent("Rewind 2026")
    expect(tile("rewind")).toHaveTextContent("Opens Dec 1")
    expect(tile("rewind")).toHaveTextContent("2025: 64 of 70 ready")
  })
})

describe("SpendTile", () => {
  it("shows this month against the season budget and links to this month's cost analysis", () => {
    render(<SpendTile spend={SPEND} f={f} />)

    expect(tile("spend")).toHaveTextContent("$1.25of $10.00 season budget")
    expect(tile("spend")).toHaveTextContent("Rewind 2026 to date: $4.20")
    expect(tile("spend")).toHaveAttribute("href", "/admin/cost-analysis?from=2026-12-01&to=2026-12-10")
  })

  it("says when the budget is reached", () => {
    render(<SpendTile spend={{ ...SPEND, seasonSpentUsd: 10 }} f={f} />)

    expect(tile("spend")).toHaveTextContent("budget reached")
  })
})

describe("a failed source", () => {
  it.each([
    ["services", "/admin/settings", () => <ServicesTile services={null} f={f} />],
    ["queues", "/admin/queues", () => <QueuesTile queues={null} f={f} />],
    ["rewind", "/admin/rewind", () => <RewindTile rewind={null} f={f} />],
    ["spend", "/admin/cost-analysis", () => <SpendTile spend={null} f={f} />],
  ] as const)("%s shows a dash, never 0, with a Couldn't load line", (id, href, ui) => {
    render(ui())

    expect(screen.getByRole("img", { name: "Not available" })).toHaveTextContent("—")
    expect(tile(id)).toHaveTextContent("Couldn't load")
    expect(tile(id)).not.toHaveTextContent("The next refresh")
    expect(tile(id)).not.toHaveTextContent(/\b0\b/)
    expect(tile(id)).toHaveAttribute("href", href)
  })
})
