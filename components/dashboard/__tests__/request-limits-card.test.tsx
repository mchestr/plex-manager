import { render, screen, within } from "@testing-library/react"

import { RequestLimitsCard } from "@/components/dashboard/request-limits-card"
import type { MemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { DEFAULT_TIERS, tierProgress } from "@/lib/request-tiers/tiers"

const limits = (hours: number | null, patch: Partial<MemberRequestLimits> = {}): MemberRequestLimits => ({
  tiers: [...DEFAULT_TIERS],
  hours,
  progress: hours === null ? null : tierProgress(hours, DEFAULT_TIERS),
  excluded: false,
  usage: { movie: { limit: 4, days: 7, used: 1, remaining: 3 }, tv: { limit: 2, days: 7, used: 2, remaining: 0 } },
  ...patch,
})

describe("RequestLimitsCard", () => {
  it("shows the tier, the limits and the requests left", () => {
    render(<RequestLimitsCard limits={limits(37)} />)

    expect(screen.getByTestId("request-limits-tier")).toHaveTextContent("Tier 2")
    expect(screen.getByTestId("request-limits-tier")).toHaveTextContent("4 movies and 2 shows every 7 days")
    expect(screen.getByTestId("request-limits-movies")).toHaveTextContent("3 left")
    expect(screen.getByTestId("request-limits-movies")).toHaveTextContent("1 of 4 used")
    expect(screen.getByTestId("request-limits-tv")).toHaveTextContent("0 left")
  })

  it("draws progress to the next tier", () => {
    render(<RequestLimitsCard limits={limits(37)} />)

    expect(screen.getByRole("progressbar", { name: "Watch time to the next tier" })).toHaveAttribute("aria-valuenow", "50")
    expect(screen.getByTestId("request-limits-progress")).toHaveTextContent("Watch 13 hours more for Tier 3: 6 movies and 3 shows.")
  })

  it("says so on the top tier", () => {
    render(<RequestLimitsCard limits={limits(250, { usage: null })} />)

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.getByTestId("request-limits-progress")).toHaveTextContent("You're on the top tier.")
  })

  it("shows unlimited requests", () => {
    render(<RequestLimitsCard limits={limits(250, { usage: { movie: { limit: 0, days: 7, used: 9, remaining: null }, tv: { limit: 0, days: 7, used: 0, remaining: null } } })} />)

    expect(screen.getByTestId("request-limits-movies")).toHaveTextContent("Unlimited")
  })

  it("lists every tier and marks the current one", () => {
    render(<RequestLimitsCard limits={limits(37)} />)

    const table = screen.getByTestId("request-limits-table")
    expect(within(table).getAllByRole("row")).toHaveLength(6)
    expect(screen.getByTestId("request-limits-tier-2")).toHaveAttribute("aria-current", "true")
    expect(screen.getByTestId("request-limits-tier-1")).not.toHaveAttribute("aria-current")
    expect(screen.getByTestId("request-limits-tier-5")).toHaveTextContent("Over 200 h")
    expect(screen.getByTestId("request-limits-tier-5")).toHaveTextContent("Unlimited / 7 d")
  })

  it("leaves out the tier and progress for a member whose limits an admin set", () => {
    render(<RequestLimitsCard limits={limits(37, { excluded: true })} />)

    expect(screen.queryByTestId("request-limits-tier")).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.getByText("An admin set your limits, so watching more doesn't change them.")).toBeInTheDocument()
    expect(screen.getByTestId("request-limits-movies")).toBeInTheDocument()
    expect(screen.getByTestId("request-limits-table").querySelector("[aria-current]")).toBeNull()
  })

  it("says when the watch time is unavailable", () => {
    render(<RequestLimitsCard limits={limits(null)} />)

    expect(screen.getByTestId("request-limits-no-hours")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })
})
