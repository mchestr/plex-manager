import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { render, renderHook, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { DataTable } from "@/components/ui/data-table/data-table"
import { groupRows } from "@/components/ui/data-table/group-rows"

expect.extend(toHaveNoViolations)

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

interface Season {
  key: string
  title: string
  day: string
  gb: number
}

// Two leave dates: six seasons on the first, two on the second
const seasons: Season[] = [
  ...Array.from({ length: 6 }, (_, index) => ({ key: `s${index + 1}`, title: `Harbor Lights, Season ${index + 1}`, day: "2026-11-19", gb: 40 - index })),
  { key: "s7", title: "Copper Valley, Season 1", day: "2026-12-02", gb: 30 },
  { key: "s8", title: "Copper Valley, Season 2", day: "2026-12-02", gb: 20 },
]

const columns: ColumnDef<Season>[] = [
  { id: "title", header: "Title", accessorKey: "title", meta: { card: "title" } },
  { id: "size", header: "Size", cell: ({ row }) => `${row.original.gb} GB`, enableSorting: true, meta: { align: "end", card: "field" } },
]

const header = (day: string, rows: Season[]) => `${day === "2026-11-19" ? "Nov 19" : "Dec 2"}: ${rows.length} seasons, ${rows.reduce((sum, row) => sum + row.gb, 0)} GB`

function Leaving({ selectable = true, initialRows = 4, getRowHref }: { selectable?: boolean; initialRows?: number; getRowHref?: (row: Season) => "/admin/users" }) {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <DataTable
      label="Leaving soon"
      noun="titles"
      columns={columns}
      data={seasons}
      getRowId={(row) => row.key}
      getRowHref={getRowHref}
      pagination={{ page: 1, pageSize: 50, total: seasons.length }}
      sort={{ id: "size", desc: true }}
      empty={null}
      size="wide"
      selectable={selectable ? { selected, onSelectedChange: setSelected, getRowLabel: (row) => row.title } : undefined}
      groupBy={{ getGroupKey: (row) => row.day, renderHeader: header, initialRows }}
      data-testid="admin-cleanup-leaving"
    />
  )
}

const group = (day: string) => screen.getByTestId(`admin-cleanup-leaving-group-${day}`)
const groupBox = (name: string) => screen.getByRole("checkbox", { name: `Select ${name}` })
const bodyRows = () => screen.getAllByTestId(/^admin-cleanup-leaving-row-s\d+$/)

beforeEach(() => resetUrl("/admin/cleanup?tab=leaving-soon"))

describe("groupRows", () => {
  it("keeps the order in which each key first appears", () => {
    const { result } = renderHook(() =>
      useReactTable({ data: seasons, columns, getRowId: (row) => row.key, getCoreRowModel: getCoreRowModel() })
    )
    const groups = groupRows(result.current.getRowModel().rows, (row) => row.day)
    expect(groups.map((entry) => [entry.key, entry.rows.map((row) => row.id)])).toEqual([
      ["2026-11-19", ["s1", "s2", "s3", "s4", "s5", "s6"]],
      ["2026-12-02", ["s7", "s8"]],
    ])
  })
})

describe("GroupRows", () => {
  it("puts each group in its own tbody under a rowgroup header", async () => {
    const { container } = render(<Leaving />)
    const bodies = container.querySelectorAll("tbody")
    expect(bodies).toHaveLength(2)
    const headerCell = within(group("2026-11-19")).getByRole("rowheader")
    expect(headerCell.tagName).toBe("TH")
    expect(headerCell).toHaveAttribute("scope", "rowgroup")
    // The checkbox takes the selection column, the header the rest
    expect(headerCell).toHaveAttribute("colspan", "2")
    expect(headerCell).toHaveTextContent("Nov 19: 6 seasons, 225 GB")
    // Sorted headers keep aria-sort beside the groups
    expect(screen.getByTestId("admin-cleanup-leaving-column-size")).toHaveAttribute("aria-sort", "descending")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("names the group checkbox and the toggle after the header", () => {
    render(<Leaving />)
    expect(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-select")).toBe(groupBox("Nov 19: 6 seasons, 225 GB"))
    const toggle = screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-toggle")
    expect(toggle).toHaveAccessibleName("Nov 19: 6 seasons, 225 GB")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-show-all")).toHaveAccessibleName("Show all 6 Nov 19: 6 seasons, 225 GB")
  })

  it("selects a whole group, reads mixed while some rows are selected, and clears it", async () => {
    const user = userEvent.setup()
    render(<Leaving />)
    await user.click(groupBox("Nov 19: 6 seasons, 225 GB"))
    expect(groupBox("Nov 19: 6 seasons, 225 GB")).toHaveAttribute("aria-checked", "true")
    // Rows past the first four are selected too: the group checkbox names all six
    await user.click(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-show-all"))
    for (const key of ["s1", "s5", "s6"]) {
      expect(screen.getByTestId(`admin-cleanup-leaving-row-${key}-select`)).toHaveAttribute("aria-checked", "true")
    }
    expect(groupBox("Dec 2: 2 seasons, 50 GB")).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("checkbox", { name: "Select all titles on this page" })).toHaveAttribute("aria-checked", "mixed")

    await user.click(screen.getByRole("checkbox", { name: "Select Harbor Lights, Season 2" }))
    const mixed = groupBox("Nov 19: 6 seasons, 225 GB")
    expect(mixed).toHaveAttribute("aria-checked", "mixed")
    expect(mixed.querySelector("svg")).toHaveClass("lucide-minus")

    await user.click(mixed)
    expect(groupBox("Nov 19: 6 seasons, 225 GB")).toHaveAttribute("aria-checked", "true")
    await user.click(groupBox("Nov 19: 6 seasons, 225 GB"))
    expect(groupBox("Nov 19: 6 seasons, 225 GB")).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("checkbox", { name: "Select Harbor Lights, Season 1" })).toHaveAttribute("aria-checked", "false")
  })

  it("selects a group with Space", async () => {
    const user = userEvent.setup()
    render(<Leaving />)
    const box = groupBox("Dec 2: 2 seasons, 50 GB")
    box.focus()
    await user.keyboard(" ")
    expect(box).toHaveAttribute("aria-checked", "true")
    expect(box).toHaveFocus()
    expect(screen.getByRole("checkbox", { name: "Select Copper Valley, Season 2" })).toHaveAttribute("aria-checked", "true")
  })

  it("hides and shows its rows with the toggle, and points the toggle at them", async () => {
    const user = userEvent.setup()
    const { container } = render(<Leaving />)
    const toggle = screen.getByTestId("admin-cleanup-leaving-group-2026-12-02-toggle")
    const controlled = toggle.getAttribute("aria-controls")!.split(" ")
    expect(controlled.map((id) => document.getElementById(id)?.dataset.testid)).toEqual([
      "admin-cleanup-leaving-row-s7",
      "admin-cleanup-leaving-row-s8",
    ])

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).not.toHaveAttribute("aria-controls")
    expect(screen.queryByTestId("admin-cleanup-leaving-row-s7")).not.toBeInTheDocument()
    // The header stays, and the collapsed group holds no div (a div cannot be a child of tbody)
    const body = group("2026-12-02").closest("tbody")!
    expect(body.querySelectorAll("tr")).toHaveLength(1)
    for (const tbody of container.querySelectorAll("tbody")) expect(tbody.querySelector("div")).toBeNull()

    toggle.focus()
    await user.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("admin-cleanup-leaving-row-s7")).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("shows the first rows of a group, and Show all reveals the rest and moves focus to the first of them", async () => {
    const user = userEvent.setup()
    render(<Leaving />)
    expect(bodyRows().map((row) => row.dataset.testid)).toEqual([
      "admin-cleanup-leaving-row-s1",
      "admin-cleanup-leaving-row-s2",
      "admin-cleanup-leaving-row-s3",
      "admin-cleanup-leaving-row-s4",
      "admin-cleanup-leaving-row-s7",
      "admin-cleanup-leaving-row-s8",
    ])
    // A group with no more rows than it shows has no Show all
    expect(screen.queryByTestId("admin-cleanup-leaving-group-2026-12-02-show-all")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^Show all 6/ }))
    expect(bodyRows()).toHaveLength(8)
    expect(screen.queryByTestId("admin-cleanup-leaving-group-2026-11-19-show-all")).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Select Harbor Lights, Season 5" })).toHaveFocus()

    // Closed and opened again, the group still shows every row
    await user.click(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-toggle"))
    await user.click(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-toggle"))
    expect(bodyRows()).toHaveLength(8)
  })

  it("hides Show all while the group is closed", async () => {
    const user = userEvent.setup()
    render(<Leaving />)
    await user.click(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-toggle"))
    expect(screen.queryByTestId("admin-cleanup-leaving-group-2026-11-19-show-all")).not.toBeInTheDocument()
  })

  it("moves focus to the revealed row's link in a table without checkboxes", async () => {
    const user = userEvent.setup()
    render(<Leaving selectable={false} getRowHref={() => "/admin/users"} />)
    expect(within(group("2026-11-19")).queryByRole("checkbox")).not.toBeInTheDocument()
    expect(within(group("2026-11-19")).getByRole("rowheader")).toHaveAttribute("colspan", "2")
    await user.click(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-show-all"))
    expect(screen.getByRole("link", { name: "Harbor Lights, Season 5" })).toHaveFocus()
  })

  it("moves focus to the toggle when the revealed row holds nothing to focus", async () => {
    const user = userEvent.setup()
    render(<Leaving selectable={false} initialRows={2} />)
    await user.click(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-show-all"))
    expect(screen.getByTestId("admin-cleanup-leaving-group-2026-11-19-toggle")).toHaveFocus()
  })
})
