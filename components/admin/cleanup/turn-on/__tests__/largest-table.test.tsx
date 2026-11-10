/**
 * "The 10 largest" (UX 4.6, 8.4, 11.1 item 5): ten rows with their cells,
 * a "Why" button per row that opens the Why Sheet, the link to the rule
 * preview, and focus after a Postpone or an Exclude from the Sheet
 * (owner-r8-1, ux-a11y-r8-1, ux-a11y-r8-2).
 */

import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { changeModeData, F, largestRow, turnOnData } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import { LargestTable, largestTitle, playedText, requesterLines } from "@/components/admin/cleanup/turn-on/largest-table"
import type { WhySheetProps } from "@/components/admin/cleanup/why/why-sheet"

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/admin/cleanup/rules/rule-1/turn-on",
  useSearchParams: () => new URLSearchParams(),
}))
let sheet: WhySheetProps | null = null
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({
  WhySheet: (props: WhySheetProps) => {
    sheet = props
    return props.itemKey ? <div data-testid="why-sheet">{props.title}</div> : null
  },
}))

beforeEach(() => {
  sheet = null
})

const closeFocus = () => {
  const finalFocus = sheet?.finalFocus
  if (typeof finalFocus !== "function") throw new Error("no finalFocus function")
  return finalFocus("mouse")
}

it("shows ten rows with their cells and a named Why button on each", () => {
  render(<LargestTable data={turnOnData()} />)

  expect(screen.getByRole("heading", { level: 2, name: "The 10 largest" })).toBeInTheDocument()
  const table = screen.getByRole("table", { name: "The 10 largest" })
  expect(within(table).getAllByRole("row")).toHaveLength(11)
  const first = screen.getByTestId("admin-cleanup-turn-on-largest-row-movie:tmdb:1")
  expect(first).toHaveTextContent("Invented Movie 1 (2021)")
  expect(first).toHaveTextContent("29 GB")
  expect(first).toHaveTextContent("Aug 14, 2024")
  expect(first).toHaveTextContent("Feb 9, 2023")
  expect(first).toHaveTextContent("Nobody")
  expect(screen.getByRole("button", { name: "Why: Invented Movie 1" })).toHaveAttribute("data-testid", "admin-cleanup-turn-on-largest-movie:tmdb:1-why")
  expect(screen.getByTestId("admin-cleanup-turn-on-largest-card")).toHaveTextContent("Of 197 movies. See all in the rule preview")
  expect(screen.getByTestId("admin-cleanup-turn-on-preview-link")).toHaveAttribute("href", "/admin/cleanup/rules/rule-1")
  expect(screen.getByText("Showing all 10 largest movies")).toBeInTheDocument()
})

it("opens the Why Sheet of a row for this rule, with the Leaving soon actions only in Change mode", async () => {
  const { rerender } = render(<LargestTable data={turnOnData()} />)
  expect(sheet).toMatchObject({ itemKey: null, scope: "rule-1", ruleId: "rule-1", surface: "preview" })

  const why = screen.getByRole("button", { name: "Why: Invented Movie 3" })
  await userEvent.click(why)
  expect(screen.getByTestId("why-sheet")).toHaveTextContent("Invented Movie 3")
  expect(sheet?.itemKey).toBe("movie:tmdb:3")
  expect(closeFocus()).toBe(true)

  act(() => sheet?.onClose())
  expect(screen.queryByTestId("why-sheet")).not.toBeInTheDocument()
  // The same button: the Sheet gives focus back to it
  expect(screen.getByRole("button", { name: "Why: Invented Movie 3" })).toBe(why)

  rerender(<LargestTable data={changeModeData()} />)
  expect(sheet?.surface).toBe("leaving")
})

it("after an action, returns focus to the row's Why button, or to the heading once the row is gone", async () => {
  const data = turnOnData()
  const { rerender } = render(<LargestTable data={data} />)
  await userEvent.click(screen.getByRole("button", { name: "Why: Invented Movie 2" }))

  act(() => sheet?.onActionDone?.({ excluded: 1, rescued: 1, skipped: 0 }))
  expect(closeFocus()).toBe(screen.getByRole("button", { name: "Why: Invented Movie 2" }))
  act(() => sheet?.onClose())
  ;(document.activeElement as HTMLElement | null)?.blur()

  // The new rows come after the close, without the excluded title: focus goes to the heading
  rerender(<LargestTable data={{ ...data, largest: data.largest.filter((r) => r.itemKey !== "movie:tmdb:2") }} />)
  expect(screen.getByRole("heading", { level: 2, name: "The 9 largest" })).toHaveFocus()
})

it("leaves focus alone when it already has a place after the new rows", async () => {
  const data = turnOnData()
  const { rerender } = render(<LargestTable data={data} />)
  await userEvent.click(screen.getByRole("button", { name: "Why: Invented Movie 4" }))
  act(() => sheet?.onActionDone?.({ postponed: 1, skipped: 0, firstLeaveOn: "2026-12-15", lastLeaveOn: "2026-12-15" }))
  act(() => sheet?.onClose())
  const why = screen.getByRole("button", { name: "Why: Invented Movie 4" })
  why.focus()

  rerender(<LargestTable data={{ ...data, largest: [largestRow(4), largestRow(11)] }} />)
  expect(screen.getByRole("button", { name: "Why: Invented Movie 4" })).toHaveFocus()
})

it("shows an empty state without rows", () => {
  render(<LargestTable data={turnOnData({ largest: [] })} />)
  expect(screen.getByText("No movies to show")).toBeInTheDocument()
})

it("words the cells and the title", () => {
  expect(requesterLines(null, F)).toEqual(["Unknown"])
  expect(requesterLines([], F)).toEqual(["Nobody"])
  expect(requesterLines("importList", F)).toEqual(["Nobody (import list)"])
  expect(
    requesterLines(
      [
        { name: "Riley Example", status: "former", at: "2024-01-01T00:00:00.000Z" },
        { name: "Unknown member", status: "unknown", at: "2024-01-01T00:00:00.000Z" },
        { name: "Sam Example", status: "member", at: "2024-03-01T00:00:00.000Z" },
      ],
      F
    )
  ).toEqual(["Riley Example, former member", "Unknown member", "Sam Example, Mar 2024"])
  expect(playedText(null, F)).toBe("Unknown")
  expect(playedText("never", F)).toBe("Never")
  expect(largestTitle(1)).toBe("The largest")
  expect(largestTitle(0)).toBe("The 10 largest")
})
