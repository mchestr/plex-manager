import { render, screen } from "@testing-library/react"

import { RequestLimitsCard } from "@/components/dashboard/request-limits-card"
import type { MemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { DEFAULT_TIERS, tierProgress } from "@/lib/request-tiers/tiers"

const limits = (hours: number | null, patch: Partial<MemberRequestLimits> = {}): MemberRequestLimits => ({
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

  it("shows only the member's tier and the next one, never the other tiers", () => {
    render(<RequestLimitsCard limits={limits(37)} />)

    // Compare the full text, so a figure from any other tier fails, with or without a "Tier N" label
    expect(screen.getByTestId("home-request-limits-card").textContent).toBe(
      [
        "Your request limits",
        "The more you watch, the more you can request.",
        "Tier 2",
        "4 movies and 2 shows every 7 days",
        "Movies",
        "3 left (1 of 4 used, per 7 days)",
        "Shows",
        "0 left (2 of 2 used, per 7 days)",
        "Watch 13 hours more for Tier 3: 6 movies and 3 shows.",
      ].join(""),
    )
  })

  it("names the next tier's period when it differs from this tier's", () => {
    const tiers = [
      { overHours: 0, movieLimit: 2, tvLimit: 1, days: 1 },
      { overHours: 24, movieLimit: 8, tvLimit: 4, days: 30 },
    ]
    const usage = { movie: { limit: 2, days: 1, used: 0, remaining: 2 }, tv: { limit: 1, days: 1, used: 1, remaining: 0 } }
    render(<RequestLimitsCard limits={limits(10, { progress: tierProgress(10, tiers), usage })} />)

    expect(screen.getByTestId("request-limits-tier")).toHaveTextContent("2 movies and 1 show every day")
    expect(screen.getByTestId("request-limits-movies")).toHaveTextContent("(0 of 2 used, per day)")
    expect(screen.getByTestId("request-limits-progress")).toHaveTextContent("Watch 14 hours more for Tier 2: 8 movies and 4 shows every 30 days.")
  })

  it("leaves out the tier and progress for a member whose limits an admin set", () => {
    render(<RequestLimitsCard limits={limits(37, { excluded: true })} />)

    expect(screen.queryByTestId("request-limits-tier")).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.getByText("An admin set your limits, so watching more doesn't change them.")).toBeInTheDocument()
    expect(screen.getByTestId("request-limits-movies")).toBeInTheDocument()
    expect(screen.queryByTestId("request-limits-unavailable")).not.toBeInTheDocument()
  })

  it("says when an admin set the limits and Overseerr gave no counts", () => {
    render(<RequestLimitsCard limits={limits(37, { excluded: true, usage: null })} />)

    expect(screen.getByTestId("request-limits-unavailable")).toHaveTextContent("Your request limits aren't available right now.")
  })

  it("says when the watch time is unavailable", () => {
    render(<RequestLimitsCard limits={limits(null)} />)

    expect(screen.getByTestId("request-limits-no-hours")).toBeInTheDocument()
    expect(screen.queryByTestId("request-limits-unavailable")).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("says the limits are unavailable when neither the watch time nor the counts came back", () => {
    render(<RequestLimitsCard limits={limits(null, { usage: null })} />)

    expect(screen.getByTestId("request-limits-unavailable")).toBeInTheDocument()
    expect(screen.queryByTestId("request-limits-no-hours")).not.toBeInTheDocument()
  })
})
