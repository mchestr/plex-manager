import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { Combobox, type ComboboxGroup } from "@/components/ui/combobox"

expect.extend(toHaveNoViolations)

interface Requester {
  id: string
  name: string
  requests?: number
}

const special: Requester[] = [
  { id: "any", name: "Any member" },
  { id: "former", name: "Former members" },
]
const members: Requester[] = [
  { id: "m1", name: "Robin Vale", requests: 47 },
  { id: "m2", name: "Sky Moreno", requests: 31 },
]
const groups: ComboboxGroup<Requester>[] = [
  { label: "Special", items: special },
  { label: "Members who made requests", items: members },
]

function Requesters({
  initial = [],
  onChange,
  grouped = true,
  multiple,
}: {
  initial?: Requester[]
  onChange?: (value: Requester[]) => void
  grouped?: boolean
  multiple?: boolean
}) {
  const [value, setValue] = useState<Requester[]>(initial)
  const common = {
    value,
    onValueChange: (next: Requester[]) => {
      setValue(next)
      onChange?.(next)
    },
    multiple,
    getLabel: (item: Requester) => item.name,
    getKey: (item: Requester) => item.id,
    placeholder: "Find a member",
    "aria-label": "Requested by",
    "data-testid": "admin-cleanup-condition-editor-list",
  }
  return (
    <main>
      {grouped ? (
        <Combobox<Requester>
          {...common}
          groups={groups}
          renderItem={(item) => (
            <>
              {item.name}
              {item.requests !== undefined && <span className="text-muted-foreground">{item.requests} requests</span>}
            </>
          )}
        />
      ) : (
        <Combobox<Requester> {...common} items={members} emptyText="No member has that name" />
      )}
    </main>
  )
}

const input = () => screen.getByRole("combobox", { name: "Requested by" })

describe("Combobox", () => {
  it("is a named editable combobox whose list shows groups with headings, with no axe violations", async () => {
    const user = userEvent.setup()
    render(<Requesters />)
    expect(input()).toHaveAttribute("data-testid", "admin-cleanup-condition-editor-list")
    expect(input()).toHaveAttribute("placeholder", "Find a member")

    await user.click(input())
    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).getByText("Special")).toBeInTheDocument()
    expect(within(listbox).getByText("Members who made requests")).toBeInTheDocument()
    expect(within(listbox).getAllByRole("group")).toHaveLength(2)
    expect(screen.getByTestId("admin-cleanup-condition-editor-list-option-m1")).toHaveTextContent("Robin Vale47 requests")
    // The list portals to the body, outside the page landmarks, as Select's does.
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })

  it("filters by label as you type, and chooses with the arrows and Enter", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Requesters onChange={onChange} />)
    await user.type(input(), "sky")
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))
    expect(screen.getByRole("option")).toHaveTextContent("Sky Moreno")

    await user.keyboard("{ArrowDown}")
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id)
    await user.keyboard("{Enter}")
    expect(onChange).toHaveBeenLastCalledWith([members[1]])
  })

  it("shows each choice as a chip with a named remove button", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Requesters initial={[special[1], members[0]]} onChange={onChange} />)
    expect(screen.getByTestId("admin-cleanup-condition-editor-list-chip-former")).toHaveTextContent("Former members")
    expect(input()).not.toHaveAttribute("placeholder")

    await user.click(screen.getByRole("button", { name: "Remove Former members" }))
    expect(onChange).toHaveBeenLastCalledWith([members[0]])
    expect(screen.queryByTestId("admin-cleanup-condition-editor-list-chip-former")).toBeNull()
    expect(screen.getByTestId("admin-cleanup-condition-editor-list-chip-m1-remove")).toHaveAccessibleName("Remove Robin Vale")
  })

  it("adds and removes choices from the list, with a check on chosen items, and Backspace removes the last chip", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Requesters initial={[members[0]]} onChange={onChange} />)
    await user.click(input())
    const chosen = await screen.findByTestId("admin-cleanup-condition-editor-list-option-m1")
    expect(chosen).toHaveAttribute("aria-selected", "true")

    await user.click(screen.getByTestId("admin-cleanup-condition-editor-list-option-any"))
    expect(onChange).toHaveBeenLastCalledWith([members[0], special[0]])
    await user.click(screen.getByTestId("admin-cleanup-condition-editor-list-option-m1"))
    expect(onChange).toHaveBeenLastCalledWith([special[0]])

    await user.keyboard("{Escape}")
    await user.keyboard("{Backspace}")
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it("shows the empty text when nothing matches, in a flat list", async () => {
    const user = userEvent.setup()
    render(<Requesters grouped={false} />)
    await user.type(input(), "zzz")
    expect(await screen.findByText("No member has that name")).toBeInTheDocument()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("holds one choice without multiple, shown in the input", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Requesters grouped={false} multiple={false} initial={[members[1]]} onChange={onChange} />)
    expect(input()).toHaveValue("Sky Moreno")
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull()

    await user.click(input())
    await user.click(await screen.findByTestId("admin-cleanup-condition-editor-list-option-m1"))
    expect(onChange).toHaveBeenLastCalledWith([members[0]])
    await waitFor(() => expect(input()).toHaveValue("Robin Vale"))
  })

  it("marks an invalid value and can be disabled", () => {
    render(
      <Combobox<Requester>
        items={members}
        value={[]}
        onValueChange={() => {}}
        getLabel={(item) => item.name}
        getKey={(item) => item.id}
        invalid
        disabled
        aria-label="Requested by"
        aria-describedby="requesters-error"
        data-testid="list"
      />
    )
    expect(input()).toHaveAttribute("aria-invalid", "true")
    expect(input()).toBeDisabled()
    expect(input()).toHaveAttribute("aria-describedby", "requesters-error")
    expect(input().closest("[data-slot=combobox]")).toHaveClass("border-destructive")
  })
})
