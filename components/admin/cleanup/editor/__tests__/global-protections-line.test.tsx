import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { GlobalProtectionsLine } from "@/components/admin/cleanup/editor/global-protections-line"
import type { EditorGlobalProtection } from "@/lib/cleanup/types/rule-parts"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const GLOBALS: EditorGlobalProtection[] = [
  { id: "g1", sentence: "Kept by a member, until the Keep ends", enabled: true, appliesToLevel: true },
  { id: "g4", sentence: "Played by anyone in the last 30 days", enabled: true, appliesToLevel: true },
  { id: "g8", sentence: "On the watchlist of a member with access, where known", enabled: false, appliesToLevel: true },
  { id: "g11", sentence: "Season rules: the newest season of a continuing show", enabled: true, appliesToLevel: false },
]

const COUNTS = new Map([["g4", 4]])
const tid = (id: string) => screen.getByTestId(id)

describe("GlobalProtectionsLine", () => {
  it("counts the protections that are on for the level, and the items they keep safe", async () => {
    const { container } = render(<GlobalProtectionsLine level="movie" protections={GLOBALS} counts={COUNTS} kept={17} />)
    const line = tid("admin-cleanup-global-protections")
    expect(within(line).getAllByText(/global protections/)[0].tagName).toBe("STRONG")
    expect(tid("admin-cleanup-global-protections-show")).toHaveTextContent("Show each")
    expect(tid("admin-cleanup-global-protections-row")).toHaveTextContent("Always on: 2 global protections keep 17 movies safe.")
    expect(tid("admin-cleanup-global-protections-settings")).toHaveAttribute("href", "/admin/cleanup?tab=settings&section=cleanup-protections")
    expect(tid("admin-cleanup-global-protections-settings")).toHaveTextContent("Change in Settings")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("shows each protection as a read-only token with its count", async () => {
    const user = userEvent.setup()
    render(<GlobalProtectionsLine level="movie" protections={GLOBALS} counts={COUNTS} kept={17} />)
    const show = tid("admin-cleanup-global-protections-show")
    expect(show).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("admin-cleanup-global-protection-g4")).toBeNull()
    await user.click(show)
    expect(show).toHaveAttribute("aria-expanded", "true")
    const token = tid("admin-cleanup-global-protection-g4")
    expect(token).toHaveAttribute("data-state", "readOnly")
    expect(token.parentElement).toHaveTextContent("Played by anyone in the last 30 days4")
    expect(tid("admin-cleanup-global-protection-g1").parentElement).toHaveTextContent("0")
    expect(screen.queryByTestId("admin-cleanup-global-protection-g8")).toBeNull()
    expect(screen.queryByTestId("admin-cleanup-global-protection-g11")).toBeNull()
  })

  it("opens the same list from the phone row button", async () => {
    const user = userEvent.setup()
    render(<GlobalProtectionsLine level="season" protections={GLOBALS} counts={COUNTS} kept={1} />)
    const row = tid("admin-cleanup-global-protections-row")
    expect(row).toHaveTextContent("Always on: 3 global protections keep 1 season safe.")
    expect(row).toHaveAttribute("aria-expanded", "false")
    expect(row).not.toHaveAttribute("aria-controls")
    await user.click(row)
    expect(row).toHaveAttribute("aria-expanded", "true")
    const list = screen.getByRole("list", { name: "Global protections" })
    expect(row.getAttribute("aria-controls")).toBe(list.parentElement?.id)
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
    await user.click(row)
    expect(screen.queryByRole("list", { name: "Global protections" })).toBeNull()
  })

  it("uses the singular for one protection", () => {
    render(<GlobalProtectionsLine level="show" protections={[GLOBALS[0]]} counts={COUNTS} kept={1} />)
    expect(tid("admin-cleanup-global-protections-row")).toHaveTextContent("Always on: 1 global protection keeps 1 show safe.")
  })
})
