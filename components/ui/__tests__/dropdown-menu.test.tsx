import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { Copy, UserRound, UserX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

expect.extend(toHaveNoViolations)

function Example({ onRemove = jest.fn() }: { onRemove?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" aria-label="Actions for Sam Rivera" />} />
      <DropdownMenuContent data-testid="menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sam Rivera</DropdownMenuLabel>
          <DropdownMenuItem icon={<UserRound />}>View profile</DropdownMenuItem>
          <DropdownMenuItem icon={<Copy />}>Copy email</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<UserX />} variant="destructive" onClick={onRemove}>
          Remove access...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Actions for Sam Rivera" }))
  return screen.findByRole("menu")
}

describe("DropdownMenu", () => {
  it("is a menu of menuitems under a label naming the entity, with no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const menu = await openMenu(user)

    expect(menu).toHaveAttribute("data-testid", "menu")
    expect(screen.getAllByRole("menuitem")).toHaveLength(3)
    expect(screen.getByRole("group", { name: "Sam Rivera" })).toBeInTheDocument()
    expect(screen.getByRole("separator")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Remove access..." })).toHaveClass("text-destructive")
    // Popups portal outside the page's landmarks, as they do in the app.
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })

  it("moves with the arrows, Home and End, and typeahead", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await openMenu(user)
    const item = (name: string) => screen.getByRole("menuitem", { name })

    await user.keyboard("{ArrowDown}")
    await waitFor(() => expect(item("View profile")).toHaveFocus())
    await user.keyboard("{ArrowDown}")
    expect(item("Copy email")).toHaveFocus()
    await user.keyboard("{End}")
    expect(item("Remove access...")).toHaveFocus()
    await user.keyboard("{Home}")
    expect(item("View profile")).toHaveFocus()
    await user.keyboard("r")
    await waitFor(() => expect(item("Remove access...")).toHaveFocus())
  })

  it("runs an item on Enter and closes", async () => {
    const user = userEvent.setup()
    const onRemove = jest.fn()
    render(<Example onRemove={onRemove} />)
    await openMenu(user)

    await user.keyboard("{End}{Enter}")

    expect(onRemove).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await openMenu(user)

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Actions for Sam Rivera" })).toHaveFocus()
  })
})
