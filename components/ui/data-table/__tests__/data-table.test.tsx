import type { ColumnDef } from "@tanstack/react-table"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { UserX } from "lucide-react"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { parseTableParams } from "@/lib/ui/table-params"

expect.extend(toHaveNoViolations)

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

interface Member {
  id: string
  name: string
  email: string
  plays: number
}

const members: Member[] = Array.from({ length: 60 }, (_, index) => ({
  id: `m${index + 1}`,
  name: `Member ${index + 1}`,
  email: `member${index + 1}@example.com`,
  plays: index * 3,
}))

const columns: ColumnDef<Member>[] = [
  { id: "name", header: "Name", accessorKey: "name", enableSorting: true, meta: { card: "title" } },
  { id: "email", header: "Email", accessorKey: "email", meta: { card: "sub" } },
  { id: "plays", header: "Plays", accessorKey: "plays", enableSorting: true, meta: { align: "end", card: "field" } },
]

const onRemove = jest.fn()

/** The page around the table: it reads the URL the way a server page would, so a URL change needs a rerender. */
function Page({ rows = members }: { rows?: Member[] }) {
  const params = parseTableParams(new URLSearchParams(currentHref().split("?")[1] ?? ""), {
    sortable: ["name", "plays"],
    defaultSort: { id: "name", desc: false },
  })
  const start = (params.page - 1) * params.pageSize
  return (
    <DataTable
      label="Members"
      noun="members"
      columns={columns}
      data={rows.slice(start, start + params.pageSize)}
      getRowId={(member) => member.id}
      getRowHref={(member) => `/admin/users/${member.id}` as "/admin/users"}
      getRowName={(member) => member.name}
      rowActions={(member) => [
        { id: "remove", label: "Remove Plex access...", icon: UserX, variant: "destructive", onSelect: () => onRemove(member.id) },
      ]}
      sort={params.sort}
      pagination={{ page: params.page, pageSize: params.pageSize, total: rows.length }}
      empty={<EmptyState kind="filtered" icon={UserX} title="No members match" description="Clear the filters." />}
      data-testid="admin-users"
    />
  )
}

beforeEach(() => {
  resetUrl("/admin/users?conversationId=c_42")
  onRemove.mockClear()
})

describe("DataTable", () => {
  it("gives every header scope=col and sortable headers aria-sort", async () => {
    const { container } = render(<Page />)
    const headers = screen.getAllByRole("columnheader")
    for (const header of headers) expect(header).toHaveAttribute("scope", "col")
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending")
    expect(screen.getByRole("columnheader", { name: /Plays/ })).toHaveAttribute("aria-sort", "none")
    expect(screen.getByRole("columnheader", { name: "Email" })).not.toHaveAttribute("aria-sort")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("cycles aria-sort through the URL and keeps the other params", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Page />)
    const plays = () => screen.getByRole("columnheader", { name: /Plays/ })

    await user.click(within(plays()).getByRole("button"))
    expect(currentHref()).toBe("/admin/users?conversationId=c_42&sort=plays")
    rerender(<Page />)
    expect(plays()).toHaveAttribute("aria-sort", "ascending")

    await user.click(within(plays()).getByRole("button"))
    expect(currentHref()).toBe("/admin/users?conversationId=c_42&sort=-plays")
    rerender(<Page />)
    expect(plays()).toHaveAttribute("aria-sort", "descending")

    await user.click(within(plays()).getByRole("button"))
    expect(currentHref()).toBe("/admin/users?conversationId=c_42")
    rerender(<Page />)
    expect(plays()).toHaveAttribute("aria-sort", "none")
  })

  it("goes back to page 1 on a sort change", async () => {
    resetUrl("/admin/users?page=2")
    const user = userEvent.setup()
    render(<Page />)
    await user.click(within(screen.getByRole("columnheader", { name: /Plays/ })).getByRole("button"))
    expect(currentHref()).toBe("/admin/users?sort=plays")
  })

  it("renders the first cell as a real link and emits row test ids", () => {
    render(<Page />)
    const row = screen.getByTestId("admin-users-row-m1")
    const cells = within(row).getAllByRole("cell")
    expect(within(cells[0]).getByRole("link", { name: "Member 1" })).toHaveAttribute("href", "/admin/users/m1")
    expect(row).not.toHaveAttribute("onclick")
  })

  it("opens row actions by keyboard, headed with the row's name", async () => {
    const user = userEvent.setup()
    render(<Page />)
    const trigger = screen.getByRole("button", { name: "Actions for Member 2" })
    trigger.focus()
    await user.keyboard("{Enter}")
    const menu = await screen.findByRole("menu")
    expect(within(menu).getByText("Member 2")).toBeInTheDocument()
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")
    expect(onRemove).toHaveBeenCalledWith("m2")
  })

  it("renders one table at every width, its cells tagged for the card layout", async () => {
    const user = userEvent.setup()
    render(<Page />)
    expect(screen.getByTestId("admin-users")).toHaveAttribute("data-table-size", "default")
    expect(screen.getAllByRole("table", { name: "Members" })).toHaveLength(1)
    expect(screen.queryByRole("list")).not.toBeInTheDocument()

    const row = screen.getByTestId("admin-users-row-m3")
    expect(row).toHaveAttribute("role", "row")
    const cells = within(row).getAllByRole("cell")
    expect(cells.map((cell) => cell.dataset.card)).toEqual(["title", "sub", "field", "actions"])
    // Only a field carries its header as a label, for the card
    expect([...row.querySelectorAll('[data-slot="cell-label"]')].map((label) => label.textContent)).toEqual(["Plays"])
    expect(within(cells[0]).getByRole("link", { name: "Member 3" })).toHaveAttribute("href", "/admin/users/m3")
    expect(cells[1]).toHaveTextContent("member3@example.com")

    await user.click(within(row).getByRole("button", { name: "Actions for Member 3" }))
    await user.click(await screen.findByRole("menuitem", { name: /Remove Plex access/ }))
    expect(onRemove).toHaveBeenCalledWith("m3")
  })

  it("draws no actions button on a row without actions, and keeps its cell", () => {
    render(
      <DataTable
        label="Jobs"
        noun="jobs"
        columns={columns}
        data={members.slice(0, 2)}
        getRowId={(member) => member.id}
        getRowName={(member) => member.name}
        rowActions={(member) => (member.id === "m1" ? [] : [{ id: "remove", label: "Remove", onSelect: jest.fn() }])}
        pagination={{ page: 1, pageSize: 25, total: 2 }}
        empty={null}
        data-testid="jobs"
      />
    )
    const idle = screen.getByTestId("jobs-row-m1")
    expect(within(idle).queryByRole("button", { name: "Actions for Member 1" })).not.toBeInTheDocument()
    expect(within(idle).getAllByRole("cell").at(-1)).toHaveAttribute("data-card", "actions")
    expect(within(screen.getByTestId("jobs-row-m2")).getByRole("button", { name: "Actions for Member 2" })).toBeInTheDocument()
  })

  it("makes a column without a card slot the title when first and leaves it out otherwise", () => {
    render(
      <DataTable
        label="Plays"
        noun="plays"
        size="wide"
        columns={[
          { id: "title", header: "Title", accessorKey: "name" },
          { id: "plays", header: "Plays", accessorKey: "plays" },
        ]}
        data={members.slice(0, 1)}
        getRowId={(member) => member.id}
        pagination={{ page: 1, pageSize: 25, total: 1 }}
        empty={null}
        data-testid="plays"
      />
    )
    expect(screen.getByTestId("plays")).toHaveAttribute("data-table-size", "wide")
    const cells = within(screen.getByTestId("plays-row-m1")).getAllByRole("cell")
    expect(cells.map((cell) => cell.dataset.card)).toEqual(["title", "hidden"])
    expect(cells[1]).toHaveClass("dt-cards:hidden")
    expect(screen.getByTestId("plays-column-plays")).toHaveClass("dt-cards:hidden")
  })

  it("pages through the URL", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Page />)
    expect(screen.getByTestId("admin-users-pagination-info")).toHaveTextContent("Showing 1 to 25 of 60 members")
    await user.click(screen.getByRole("button", { name: "Go to next page" }))
    expect(currentHref()).toBe("/admin/users?conversationId=c_42&page=2")
    rerender(<Page />)
    expect(screen.getByTestId("admin-users-pagination-info")).toHaveTextContent("Showing 26 to 50 of 60 members")
    expect(screen.getByTestId("admin-users-row-m26")).toBeInTheDocument()
  })

  it("shows no pager on one page, and says how many there are", () => {
    render(<Page rows={members.slice(0, 7)} />)
    expect(screen.getByTestId("admin-users-pagination-info")).toHaveTextContent("Showing all 7 members")
    expect(screen.queryByRole("button", { name: "Go to next page" })).not.toBeInTheDocument()
  })

  it("renders the empty state with no rows", () => {
    render(<Page rows={[]} />)
    expect(screen.getByText("No members match")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-users-pagination")).not.toBeInTheDocument()
  })

  it("renders skeleton rows while loading", () => {
    const { container } = render(
      <DataTable
        label="Members"
        noun="members"
        columns={columns}
        data={[]}
        getRowId={(member) => member.id}
        pagination={{ page: 1, pageSize: 25, total: 0 }}
        empty={null}
        loading
      />
    )
    expect(container.querySelector('[data-slot="table-skeleton"]')).toBeInTheDocument()
  })
})
