import { type ColumnDef, flexRender, getCoreRowModel, type RowSelectionState, type Updater, useReactTable } from "@tanstack/react-table"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { SELECTION_COLUMN_ID, selectionColumn, selectionOptions } from "@/components/ui/data-table/selection-column"

expect.extend(toHaveNoViolations)

interface Title {
  key: string
  title: string
  locked?: boolean
}

const titles: Title[] = [
  { key: "show-1", title: "Harbor Lights, Season 2" },
  { key: "show-2", title: "Copper Valley" },
  { key: "show-3", title: "The Long Field", locked: true },
]

const titleColumn: ColumnDef<Title> = { id: "title", header: "Title", accessorKey: "title" }

/** A table on `useReactTable`, as the batch card builds one: the caller owns the selection and may refuse a change. */
function BatchTable({
  initial = {},
  refuse = false,
  testId,
  selectAllLabel,
  onChange = jest.fn(),
}: {
  initial?: RowSelectionState
  refuse?: boolean
  testId?: string
  selectAllLabel?: string
  onChange?: (next: RowSelectionState) => void
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(initial)
  const table = useReactTable({
    data: titles,
    columns: [selectionColumn<Title>((row) => row.title, { testId, selectAllLabel }), titleColumn],
    getRowId: (row) => row.key,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: (row) => !row.original.locked,
    state: { rowSelection },
    onRowSelectionChange: (updater: Updater<RowSelectionState>) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater
      onChange(next)
      if (!refuse) setRowSelection(next)
    },
  })
  return (
    <table aria-label="Batch">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id} scope="col">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const selectAll = () => screen.getByRole("checkbox", { name: "Select all on this page" })

describe("selectionColumn", () => {
  it("is a first column with its own id that never sorts", () => {
    const column = selectionColumn<Title>((row) => row.title)
    expect(column.id).toBe(SELECTION_COLUMN_ID)
    expect(column.enableSorting).toBe(false)
  })

  it("names each box after its row and the header after the page", async () => {
    const { container } = render(<BatchTable />)
    expect(selectAll()).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Select Harbor Lights, Season 2" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Select Copper Valley" })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("takes another name for the header box", () => {
    render(<BatchTable selectAllLabel="Select all titles on this page" />)
    expect(screen.getByRole("checkbox", { name: "Select all titles on this page" })).toBeInTheDocument()
  })

  it("gives the boxes test ids under a base, and none without one", () => {
    const { unmount } = render(<BatchTable testId="admin-cleanup-batch-b1" />)
    expect(screen.getByTestId("admin-cleanup-batch-b1-select-all")).toBe(selectAll())
    expect(screen.getByTestId("admin-cleanup-batch-b1-row-show-2-select")).toHaveAccessibleName("Select Copper Valley")
    unmount()
    const { container } = render(<BatchTable />)
    expect(container.querySelector("[data-testid]")).toBeNull()
  })

  it("selects every selectable row of the page, then clears them", async () => {
    const user = userEvent.setup()
    render(<BatchTable />)
    await user.click(selectAll())
    expect(selectAll()).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("checkbox", { name: "Select Harbor Lights, Season 2" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("checkbox", { name: "Select Copper Valley" })).toHaveAttribute("aria-checked", "true")
    // A row that cannot be selected stays out, and does not hold the header back
    const locked = screen.getByRole("checkbox", { name: "Select The Long Field" })
    expect(locked).toHaveAttribute("aria-checked", "false")
    expect(locked).toHaveAttribute("aria-disabled", "true")

    await user.click(selectAll())
    expect(selectAll()).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("checkbox", { name: "Select Copper Valley" })).toHaveAttribute("aria-checked", "false")
  })

  it("shows the minus glyph and reads mixed while only some rows are selected", async () => {
    const user = userEvent.setup()
    render(<BatchTable />)
    await user.click(screen.getByRole("checkbox", { name: "Select Copper Valley" }))
    expect(selectAll()).toHaveAttribute("aria-checked", "mixed")
    expect(selectAll().querySelector("svg")).toHaveClass("lucide-minus")
    // A mixed header selects the rest
    await user.click(selectAll())
    expect(selectAll()).toHaveAttribute("aria-checked", "true")
    expect(selectAll().querySelector("svg")).toHaveClass("lucide-check")
  })

  it("toggles a row with Space and keeps focus on its box", async () => {
    const user = userEvent.setup()
    render(<BatchTable />)
    const row = screen.getByRole("checkbox", { name: "Select Harbor Lights, Season 2" })
    row.focus()
    await user.keyboard(" ")
    expect(row).toHaveAttribute("aria-checked", "true")
    expect(row).toHaveFocus()
    await user.keyboard(" ")
    expect(row).toHaveAttribute("aria-checked", "false")
    expect(row).toHaveFocus()
  })

  it("leaves every box as it was when the caller refuses the change", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<BatchTable initial={{ "show-1": true, "show-2": true }} refuse onChange={onChange} />)
    await user.click(selectAll())
    expect(onChange).toHaveBeenCalledWith({})
    expect(selectAll()).toHaveAttribute("aria-checked", "true")
    await user.click(screen.getByRole("checkbox", { name: "Select Copper Valley" }))
    expect(onChange).toHaveBeenLastCalledWith({ "show-1": true })
    expect(screen.getByRole("checkbox", { name: "Select Copper Valley" })).toHaveAttribute("aria-checked", "true")
  })

  it("reads selected rows in the table's own state", () => {
    render(<BatchTable initial={{ "show-2": true }} />)
    const table = screen.getByRole("table", { name: "Batch" })
    const checked = within(table)
      .getAllByRole("checkbox")
      .filter((box) => box.getAttribute("aria-checked") === "true")
    expect(checked).toHaveLength(1)
    expect(checked[0]).toHaveAccessibleName("Select Copper Valley")
  })
})

describe("selectionOptions", () => {
  const getRowLabel = (id: string) => id

  it("adds nothing for a table without a selection", () => {
    expect(selectionOptions(undefined)).toEqual({})
  })

  it("holds the caller's ids as TanStack Table state", () => {
    const options = selectionOptions({ selected: ["a", "b"], onSelectedChange: jest.fn(), getRowLabel })
    expect(options.enableRowSelection).toBe(true)
    expect(options.state).toEqual({ rowSelection: { a: true, b: true } })
  })

  it("hands each change back as a list of ids, from an updater or a value", () => {
    const onSelectedChange = jest.fn()
    const options = selectionOptions({ selected: ["a"], onSelectedChange, getRowLabel })
    options.onRowSelectionChange?.((old) => ({ ...old, b: true }))
    expect(onSelectedChange).toHaveBeenLastCalledWith(["a", "b"])
    options.onRowSelectionChange?.({ c: true, d: false })
    expect(onSelectedChange).toHaveBeenLastCalledWith(["c"])
  })
})
