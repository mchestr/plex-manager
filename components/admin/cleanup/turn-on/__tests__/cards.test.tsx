/**
 * The left cards of the turn-on page (UX 4.6, 8.7): what happens today,
 * the timeline with the Automatic pace, who sees it, the budget with the
 * oversize line, and the dry-run bars with their facts as text.
 */

import { render, screen, within } from "@testing-library/react"

import { changeModeData, check, F, turnOnData } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import { BudgetCard } from "@/components/admin/cleanup/turn-on/budget-card"
import { chartName, DryRunsCard, dryRunsText } from "@/components/admin/cleanup/turn-on/dry-runs-card"
import { daysBetween, LeaveTimeline } from "@/components/admin/cleanup/turn-on/leave-timeline"
import { headline, sizeLine, WhatHappensCard } from "@/components/admin/cleanup/turn-on/what-happens-card"
import { WhoSeesCard } from "@/components/admin/cleanup/turn-on/who-sees-card"

describe("WhatHappensCard", () => {
  it("says what goes into Leaving soon, with ten posters and the facts", () => {
    render(<WhatHappensCard data={turnOnData()} mode="reviewFirst" />)

    expect(screen.getByRole("heading", { level: 2, name: "What happens today" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-turn-on-headline")).toHaveTextContent("197 movies go into Leaving soon.")
    expect(screen.getByText("Up to 1.27 TB. That is 27 % of your movie storage, or about 4 weeks of new media. Torrent copies free their space later.")).toBeInTheDocument()
    const posters = screen.getByTestId("admin-cleanup-turn-on-posters")
    expect(posters).toHaveAttribute("aria-hidden", "true")
    expect(posters.querySelectorAll('[data-slot="poster"]')).toHaveLength(10)
    expect(posters).toHaveTextContent("and 187 more")
    expect(screen.getByTestId("admin-cleanup-turn-on-facts")).toHaveTextContent(
      "197 matches. 17 kept safe by Never touch. 4 with missing data stay out until their data is complete."
    )
  })

  it("leaves out the parts it does not know, and the zero facts", () => {
    const data = turnOnData({ count: 1, batch: { ...turnOnData().batch, matches: 1, protectedCount: 0, missingCount: 1, storagePercent: null, growthWeeks: 1, posters: [] } })
    render(<WhatHappensCard data={data} mode="reviewFirst" />)

    expect(headline(data)).toBe("1 movie goes into Leaving soon.")
    expect(screen.getByText("Up to 1.27 TB. That is about 1 week of new media. Torrent copies free their space later.")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-turn-on-posters")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-turn-on-facts")).toHaveTextContent("1 match. 1 with missing data stays out until its data is complete.")
    expect(sizeLine(turnOnData({ batch: { ...data.batch, storagePercent: 5, growthWeeks: null } }))).toBe(
      "Up to 1.27 TB. That is 5 % of your movie storage. Torrent copies free their space later."
    )
    expect(sizeLine(turnOnData({ rule: { level: "season" }, batch: { ...data.batch, storagePercent: 2, growthWeeks: null } }))).toContain("of your show storage")
  })

  it("keeps the leave dates in Change mode, and names the due titles for Automatic", () => {
    const { rerender } = render(<WhatHappensCard data={changeModeData()} mode="automatic" />)

    expect(screen.getByTestId("admin-cleanup-turn-on-headline")).toHaveTextContent("61 movies are in Leaving soon. Their leave dates do not change.")
    expect(screen.getByTestId("admin-cleanup-turn-on-due")).toHaveTextContent("6 movies are due. Automatic deletes them at the next nightly run, inside the budget.")
    expect(screen.queryByTestId("admin-cleanup-turn-on-facts")).not.toBeInTheDocument()

    rerender(<WhatHappensCard data={changeModeData()} mode="reviewFirst" />)
    expect(screen.queryByTestId("admin-cleanup-turn-on-due")).not.toBeInTheDocument()

    const one = changeModeData({ count: 1, batch: { ...changeModeData().batch, dueCount: 1 } })
    rerender(<WhatHappensCard data={one} mode="automatic" />)
    expect(screen.getByTestId("admin-cleanup-turn-on-headline")).toHaveTextContent("1 movie is in Leaving soon. Its leave date does not change.")
    expect(screen.getByTestId("admin-cleanup-turn-on-due")).toHaveTextContent("1 movie is due. Automatic deletes it at the next nightly run")
  })
})

describe("LeaveTimeline", () => {
  it("shows today, the leave date and the Automatic pace", () => {
    render(<LeaveTimeline data={turnOnData()} f={F} />)

    const today = screen.getByTestId("admin-cleanup-turn-on-timeline-today")
    expect(today).toHaveTextContent("Today, Nov 8")
    expect(today).toHaveTextContent("They join Leaving soon. Members see them and can keep them.")
    expect(screen.getByTestId("admin-cleanup-turn-on-timeline-leave")).toHaveTextContent(
      "Dec 8, 2026The leave date. Review first: the batch waits for you. Automatic: deletions start."
    )
    expect(screen.getByTestId("admin-cleanup-turn-on-timeline-pace")).toHaveTextContent(
      "Dec 8 to Dec 17Automatic only: at most 20 movies or 500 GB a day, so 197 movies take 10 days."
    )
    expect(screen.getByText(/takes a movie out on any day before it goes\. Each movie is read again/)).toBeInTheDocument()
  })

  it("has no pace without titles, one day for a small set, and its own words in Change mode", () => {
    const { rerender } = render(<LeaveTimeline data={turnOnData({ automaticPace: null })} f={F} />)
    expect(screen.queryByTestId("admin-cleanup-turn-on-timeline-pace")).not.toBeInTheDocument()

    const pace = { from: "2026-12-08", to: "2026-12-08", perDay: { items: 1, bytes: String(1024 ** 3) } }
    rerender(<LeaveTimeline data={changeModeData({ count: 1, automaticPace: pace })} f={F} />)
    expect(screen.getByTestId("admin-cleanup-turn-on-timeline-today")).toHaveTextContent("They stay in Leaving soon.")
    expect(screen.getByTestId("admin-cleanup-turn-on-timeline-leave")).toHaveTextContent("The first leave date.")
    expect(screen.getByTestId("admin-cleanup-turn-on-timeline-pace")).toHaveTextContent("Dec 8Automatic only: at most 1 movie or 1 GB a day, so 1 movie takes 1 day.")
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(4)
  })
})

describe("WhoSeesCard", () => {
  it("names Plex, the app, Keeps and no message, with counts only", () => {
    render(<WhoSeesCard data={turnOnData()} />)

    expect(screen.getByTestId("admin-cleanup-turn-on-who-plex")).toHaveTextContent(
      "Plex: the collection Movies leaving soon, sorted by leave date, on your Home and on the Home of the 27 members who can see Movies."
    )
    expect(screen.getByTestId("admin-cleanup-turn-on-who-app")).toHaveTextContent(
      "The app: the Leaving soon page and a Home row. 5 members requested or played a movie in this batch. They see it under For you."
    )
    expect(screen.getByTestId("admin-cleanup-turn-on-who-keep")).toHaveTextContent(
      "Keep: a member can keep a movie for 90 days, and up to 20 at a time. A kept movie leaves Leaving soon at once."
    )
    expect(screen.getByTestId("admin-cleanup-turn-on-who-message")).toHaveTextContent("No message is sent to members.")
  })

  it("words one member, none, an unknown count and Keeps off", () => {
    const one = turnOnData({ linkedMembers: 1, visibility: { collection: "Shows leaving soon", libraries: ["TV", "Kids TV"], membersWhoCanSee: 1 } })
    const { rerender } = render(<WhoSeesCard data={one} />)
    expect(screen.getByTestId("admin-cleanup-turn-on-who-plex")).toHaveTextContent("the Home of the 1 member who can see TV and Kids TV.")
    expect(screen.getByTestId("admin-cleanup-turn-on-who-app")).toHaveTextContent("1 member requested or played a movie")

    const none = turnOnData({ linkedMembers: 0, visibility: { collection: "Movies leaving soon", libraries: ["Movies"], membersWhoCanSee: null },
      keeps: { enabled: false, days: 90, limit: 20 } })
    rerender(<WhoSeesCard data={none} />)
    expect(screen.getByTestId("admin-cleanup-turn-on-who-plex")).toHaveTextContent("the Home of the members who can see Movies.")
    expect(screen.getByTestId("admin-cleanup-turn-on-who-app")).toHaveTextContent("No member requested or played a movie in this batch.")
    expect(screen.getByTestId("admin-cleanup-turn-on-who-keep")).toHaveTextContent("Keep: members cannot keep titles.")
  })
})

describe("BudgetCard", () => {
  it("shows the shared budget, the entry check and the link to Settings", () => {
    render(<BudgetCard data={turnOnData()} f={F} />)

    const card = screen.getByTestId("admin-cleanup-turn-on-budget")
    expect(card).toHaveTextContent(
      "All rules share one daily budget: at most 20 items and 500 GB a day. Old seasons nobody plays uses it too. " +
        "Items over the budget wait for the next day, oldest leave date first, then the largest."
    )
    expect(card).toHaveTextContent(
      "Later runs add new matches each night. If one night brings more than 50 new movies, or more than 10 % of the movies checked, the run adds none and asks you first."
    )
    expect(screen.getByRole("link", { name: "Change in Settings" })).toHaveAttribute("href", "/admin/cleanup?tab=settings&section=cleanup-budget")
    expect(screen.queryByTestId("admin-cleanup-turn-on-oversize")).not.toBeInTheDocument()
  })

  it("names the titles larger than the daily space budget above 0, and every rule that shares it", () => {
    const data = turnOnData({
      budgetOversize: [{ title: "Invented Epic", day: "2026-12-08" }, { title: "Invented Saga", day: "2026-12-09" }],
      budget: { items: 1, bytes: String(500 * 1024 ** 3), sharedWith: [{ id: "a", name: "Rule A" }, { id: "b", name: "Rule B" }] },
    })
    const { rerender } = render(<BudgetCard data={data} f={F} />)
    expect(screen.getByTestId("admin-cleanup-turn-on-oversize")).toHaveTextContent(
      "2 movies are larger than the daily space budget. Each goes alone on its own day: Invented Epic on Dec 8 and Invented Saga on Dec 9."
    )
    expect(screen.getByTestId("admin-cleanup-turn-on-budget")).toHaveTextContent("at most 1 item and 500 GB a day. Rule A and Rule B use it too.")

    rerender(<BudgetCard data={turnOnData({ budgetOversize: [{ title: "Invented Epic", day: "2026-12-08" }], budget: { ...data.budget, sharedWith: [] } })} f={F} />)
    expect(screen.getByTestId("admin-cleanup-turn-on-oversize")).toHaveTextContent("1 movie is larger than the daily space budget.")
    expect(screen.getByTestId("admin-cleanup-turn-on-budget")).not.toHaveTextContent("uses it too")
  })
})

describe("DryRunsCard", () => {
  it("draws plain bars in a named image and says the same facts as text", () => {
    render(<DryRunsCard data={turnOnData()} f={F} />)

    const chart = screen.getByRole("img", { name: "6 dry runs, matches between 191 and 199" })
    expect(chart.children).toHaveLength(6)
    expect(chart.lastElementChild).toHaveClass("bg-primary")
    expect(screen.getByTestId("admin-cleanup-turn-on-dry-runs-text")).toHaveTextContent("6 dry runs since Oct 27. Matches stayed between 191 and 199.")
  })

  it("says moved for unsteady matches, one count, and no dry run", () => {
    const moved = turnOnData({ checks: [check("dryRuns", "warning", "none", { count: 6, min: 191, max: 199 })] })
    expect(dryRunsText(moved, F)).toBe("6 dry runs since Oct 27. Matches moved between 191 and 199.")
    const same = turnOnData({ dryRuns: [{ at: "2026-11-01T03:07:00.000Z", matches: 1 }] })
    expect(dryRunsText(same, F)).toBe("1 dry run since Nov 1. Matches stayed at 1.")
    expect(chartName(same.dryRuns)).toBe("1 dry run, 1 match each")
    expect(chartName([{ at: "2026-11-01T03:07:00.000Z", matches: 4 }, { at: "2026-11-02T03:07:00.000Z", matches: 4 }])).toBe("2 dry runs, 4 matches each")

    render(<DryRunsCard data={turnOnData({ dryRuns: [] })} f={F} />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(within(screen.getByTestId("admin-cleanup-turn-on-dry-runs")).getByText("No finished dry run yet.")).toBeInTheDocument()
  })
})
