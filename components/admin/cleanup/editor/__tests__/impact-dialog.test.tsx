/**
 * The impact dialog of a live save (UX 7.7 item 3.2, UX 8.6): its words by
 * count, the action line at 1 and above, the three groups of "Show the {N}
 * {items}" with N the sum of the three counts, the group order, "and {N}
 * more" on a cut group, and the two buttons.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { ImpactDialog, impactCount, type ImpactDialogProps } from "@/components/admin/cleanup/editor/impact-dialog"
import { buildRef } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import type { ImpactChange, ImpactItem, PreviewImpact } from "@/lib/cleanup/types/preview"

expect.extend(toHaveNoViolations)

const GB = 1024 ** 3
// Invented titles.
const item = (change: ImpactChange, n: number, gb: number, title = `Title ${n}`): ImpactItem => ({
  ...buildRef({ itemKey: `show-${n}`, level: "show", title, sizeBytes: String(gb * GB) }),
  change,
})

const IMPACT: PreviewImpact = {
  leave: 4,
  join: 2,
  keep: 17,
  joinLeaveOn: "2026-12-08",
  actionChange: 3,
  items: [
    item("leave", 1, 10, "Quiet Harbor"),
    item("leave", 2, 30, "Lantern Row"),
    item("join", 3, 5, "Copper Fields"),
    item("join", 4, 8, "North Wind"),
    item("actionChange", 5, 2, "Glass Orchard"),
    item("actionChange", 6, 40, "Silver Coast"),
    item("actionChange", 7, 12, "Paper Moons"),
  ],
}

function setup(overrides: Partial<ImpactDialogProps> = {}) {
  const props: ImpactDialogProps = {
    open: true,
    onOpenChange: jest.fn(),
    ruleName: "Big shows nobody plays",
    mode: "reviewFirst",
    level: "show",
    impact: IMPACT,
    action: "show.delete",
    importListExclusion: true,
    saving: false,
    onSave: jest.fn(),
    ...overrides,
  }
  const user = userEvent.setup()
  const view = render(<ImpactDialog {...props} />)
  return { user, props, ...view }
}

const dialog = () => screen.getByTestId("admin-cleanup-impact-dialog")

describe("ImpactDialog", () => {
  it("names the rule, its mode and each count", async () => {
    setup()
    expect(screen.getByRole("dialog", { name: "Save changes to Big shows nobody plays?" })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent(
      "This rule is in Review first. Titles that no longer match leave Leaving soon now. New matches join at the next run, through the entry check."
    )
    expect(dialog()).toHaveTextContent("4 shows leave Leaving soon: they no longer match.")
    expect(dialog()).toHaveTextContent("2 shows join at the next run, with a leave date of Dec 8, 2026.")
    expect(dialog()).toHaveTextContent("The other 17 keep their leave date.")
    expect(screen.getByTestId("admin-cleanup-impact-action")).toHaveTextContent(
      "3 shows in Leaving soon get the new action: Sonarr deletes the shows and their files, and adds an import list exclusion for each."
    )
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("uses the singular words at 1, and the one-title action sentence", () => {
    setup({ impact: { ...IMPACT, leave: 1, join: 1, keep: 1, actionChange: 1 }, mode: "automatic", level: "movie", action: "movie.unmonitorDeleteFiles", importListExclusion: false })
    expect(dialog()).toHaveTextContent("This rule is in Automatic.")
    expect(dialog()).toHaveTextContent("1 movie leaves Leaving soon: it no longer matches.")
    expect(dialog()).toHaveTextContent("1 movie joins at the next run")
    expect(dialog()).toHaveTextContent("The other 1 keeps its leave date.")
    expect(screen.getByTestId("admin-cleanup-impact-action")).toHaveTextContent(
      "1 movie in Leaving soon gets the new action: Radarr stops monitoring the movie and deletes its file. The Radarr record stays."
    )
  })

  it("leaves out the lines of zero counts", () => {
    setup({ impact: { ...IMPACT, leave: 0, keep: 0, actionChange: 0 } })
    expect(dialog()).not.toHaveTextContent("leave Leaving soon: they")
    expect(dialog()).not.toHaveTextContent("keep their leave date")
    expect(screen.queryByTestId("admin-cleanup-impact-action")).toBeNull()
    expect(screen.getByTestId("admin-cleanup-impact-toggle")).toHaveTextContent("Show the 2 shows")
  })

  it("lists the sum of the three counts in three groups, the new action first, each largest first", async () => {
    const { user } = setup()
    expect(impactCount(IMPACT)).toBe(9)
    const toggle = screen.getByTestId("admin-cleanup-impact-toggle")
    expect(toggle).toHaveTextContent("Show the 9 shows")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("admin-cleanup-impact-list")).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    const list = screen.getByTestId("admin-cleanup-impact-list")
    expect(toggle).toHaveAttribute("aria-controls", list.id)
    const groups = within(list).getAllByRole("heading").map((heading) => heading.textContent)
    expect(groups).toEqual(["Get the new action", "Leave", "Join"])
    const titles = (change: string) => within(screen.getByTestId(`admin-cleanup-impact-group-${change}`)).getAllByRole("listitem").map((li) => li.textContent)
    expect(titles("actionChange")).toEqual(["Silver Coast40 GB", "Paper Moons12 GB", "Glass Orchard2 GB"])
    expect(titles("leave")).toEqual(["Lantern Row30 GB", "Quiet Harbor10 GB"])
    expect(titles("join")).toEqual(["North Wind8 GB", "Copper Fields5 GB"])
    // 4 leave, 2 of them in the list: the group ends with the rest
    expect(screen.getByTestId("admin-cleanup-impact-group-leave")).toHaveTextContent("and 2 more")
    expect(screen.getByTestId("admin-cleanup-impact-group-join")).not.toHaveTextContent("more")
    await user.click(toggle)
    expect(screen.queryByTestId("admin-cleanup-impact-list")).toBeNull()
  })

  it("leaves out a group with no title, and names a season by its show", async () => {
    const season: ImpactItem = { ...buildRef({ itemKey: "season-1", level: "season", title: "Long Road", seasonNumber: 4, sizeBytes: null }), change: "leave" }
    const { user } = setup({ level: "season", impact: { leave: 1, join: 0, keep: 0, actionChange: 0, joinLeaveOn: "2026-12-08", items: [season] } })
    await user.click(screen.getByTestId("admin-cleanup-impact-toggle"))
    expect(screen.queryByTestId("admin-cleanup-impact-group-join")).toBeNull()
    expect(screen.queryByTestId("admin-cleanup-impact-group-actionChange")).toBeNull()
    expect(screen.getByTestId("admin-cleanup-impact-group-leave")).toHaveTextContent("Long Road, Season 4Unknown")
  })

  it("starts folded again at each open", async () => {
    const { user, rerender, props } = setup()
    await user.click(screen.getByTestId("admin-cleanup-impact-toggle"))
    rerender(<ImpactDialog {...props} open={false} />)
    rerender(<ImpactDialog {...props} open />)
    expect(screen.queryByTestId("admin-cleanup-impact-list")).toBeNull()
  })

  it("saves with Save changes and cancels with Keep editing", async () => {
    const { user, props } = setup()
    await user.click(screen.getByTestId("admin-cleanup-impact-save"))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    await user.click(screen.getByTestId("admin-cleanup-impact-keep-editing"))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows the pending save and a refusal, and does not close while it saves", async () => {
    const { user, props } = setup({ saving: true, error: "Someone changed this rule. Reload it and try again." })
    expect(screen.getByTestId("admin-cleanup-impact-save")).toHaveTextContent("Saving")
    expect(screen.getByTestId("admin-cleanup-impact-keep-editing")).toBeDisabled()
    expect(dialog()).toHaveTextContent("Someone changed this rule. Reload it and try again.")
    await user.keyboard("{Escape}")
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })
})
