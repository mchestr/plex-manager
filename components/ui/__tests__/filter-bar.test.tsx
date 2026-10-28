import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { currentHref, replaceMock, resetUrl } from "@/__tests__/helpers/url-router"
import { FilterBar } from "@/components/ui/filter-bar"

expect.extend(toHaveNoViolations)

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const filters = [
  {
    param: "role",
    label: "Role",
    options: [
      { value: "all", label: "All" },
      { value: "admin", label: "Admin" },
      { value: "member", label: "Member" },
    ],
  },
  {
    param: "access",
    label: "Plex access",
    options: [
      { value: "all", label: "All" },
      { value: "unknown", label: "Unknown" },
    ],
  },
]

function Example({ shown = 7 }: { shown?: number }) {
  return (
    <FilterBar
      search={{ param: "q", placeholder: "Search members" }}
      filters={filters}
      sort={{ param: "sort", options: [{ value: "name", label: "Name" }, { value: "-plays", label: "Most plays" }] }}
      resultCount={{ shown, total: 7, noun: "members" }}
      data-testid="admin-users-filters"
    />
  )
}

beforeEach(() => resetUrl("/admin/users?conversationId=c_42"))

describe("FilterBar", () => {
  it("defaults every filter to All and shows no chips", async () => {
    const { container } = render(<Example />)
    expect(screen.getByTestId("admin-users-filters-filter-role")).toHaveTextContent("All")
    expect(screen.getByTestId("admin-users-filters-filter-access")).toHaveTextContent("All")
    expect(screen.queryByTestId("admin-users-filters-chip-role")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("adds a chip when a filter changes, and goes back to page 1", async () => {
    resetUrl("/admin/users?conversationId=c_42&page=3")
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByTestId("admin-users-filters-filter-role"))
    await user.click(await screen.findByRole("option", { name: "Admin" }))

    expect(currentHref()).toBe("/admin/users?conversationId=c_42&role=admin")
    expect(screen.getByTestId("admin-users-filters-chip-role")).toHaveTextContent("Role: Admin")
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument()
  })

  it("removes one filter from its chip", async () => {
    resetUrl("/admin/users?role=admin&access=unknown")
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Remove the Role filter" }))
    expect(currentHref()).toBe("/admin/users?access=unknown")
  })

  it("resets every filter and the search with Clear filters, keeping other params", async () => {
    resetUrl("/admin/users?conversationId=c_42&role=admin&access=unknown&q=sam")
    const user = userEvent.setup()
    render(<Example />)
    expect(screen.getByTestId("admin-users-filters-chip-access")).toHaveTextContent("Plex access: Unknown")
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(currentHref()).toBe("/admin/users?conversationId=c_42")
    expect(screen.queryByTestId("admin-users-filters-chip-role")).not.toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search members" })).toHaveValue("")
  })

  it("announces the result count politely", () => {
    const { rerender } = render(<Example />)
    const count = screen.getByTestId("admin-users-filters-count")
    expect(count).toHaveAttribute("aria-live", "polite")
    expect(count).toHaveTextContent("7 members")
    rerender(<Example shown={2} />)
    expect(count).toHaveTextContent("2 of 7 members")
  })

  it("writes the search to ?q= after a 250ms pause", async () => {
    jest.useFakeTimers()
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<Example />)
      await user.type(screen.getByRole("searchbox", { name: "Search members" }), "sam")
      expect(replaceMock).not.toHaveBeenCalled()
      act(() => {
        jest.advanceTimersByTime(250)
      })
      expect(replaceMock).toHaveBeenCalledTimes(1)
      expect(replaceMock).toHaveBeenCalledWith("/admin/users?conversationId=c_42&q=sam", { scroll: false })
    } finally {
      jest.useRealTimers()
    }
  })

  it("counts the active filters on the Filters button cards show", () => {
    resetUrl("/admin/users?role=admin&access=unknown")
    render(<Example />)
    expect(screen.getByTestId("admin-users-filters-filters-open")).toHaveTextContent("Filters2")
  })
})
