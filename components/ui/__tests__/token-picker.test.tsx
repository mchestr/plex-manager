import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Token } from "@/components/ui/token"
import { TokenPicker, type TokenPickerShell } from "@/components/ui/token-picker"

expect.extend(toHaveNoViolations)

const originalMatchMedia = window.matchMedia
let wide = false
let notify: () => void = () => {}

/** Sets the `md` query and tells the hook, as a browser resize would. */
function setWide(next: boolean) {
  wide = next
  act(() => notify())
}

beforeEach(() => {
  wide = false
  window.matchMedia = ((query: string) => ({
    get matches() {
      return wide
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      notify = listener
    },
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

interface HarnessProps {
  onOpenChange?: (open: boolean, details: { cancel: boolean }) => void
  headerActions?: ReactNode
  focusDone?: boolean
  focusOther?: boolean
  footerShells?: TokenPickerShell[]
}

function Harness({ onOpenChange, headerActions, focusDone, focusOther, footerShells }: HarnessProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  const other = useRef<HTMLButtonElement>(null)
  return (
    <main>
      <div role="toolbar" aria-label="Condition 2 of 3: Last played more than 365 days ago, or never.">
        <Token
          ref={anchor}
          part="value"
          state={open ? "open" : "default"}
          onClick={() => setOpen(true)}
          data-testid="admin-cleanup-condition-c2-value"
        >
          365 days
        </Token>
        <Button variant="ghost" size="icon-sm" tabIndex={-1} aria-label="Remove condition">
          x
        </Button>
      </div>
      <Button ref={other}>Add condition</Button>
      <TokenPicker
        open={open}
        onOpenChange={(next, details) => {
          onOpenChange?.(next, details)
          setOpen(next)
        }}
        anchor={anchor}
        title="Last played"
        caption="Condition 2 of 3"
        headerActions={headerActions}
        initialFocus={focusDone ? done : undefined}
        finalFocus={focusOther ? other : undefined}
        footer={(shell) => {
          footerShells?.push(shell)
          return (
            <>
              <p className="mr-auto">With this value: 197 matches</p>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button ref={done} size="sm" onClick={() => setOpen(false)} data-testid="admin-cleanup-condition-editor-done">
                Done
              </Button>
            </>
          )
        }}
        data-testid="admin-cleanup-condition-editor"
      >
        <Button variant="outline">Field: Last played</Button>
      </TokenPicker>
    </main>
  )
}

const token = () => screen.getByTestId("admin-cleanup-condition-c2-value")
const editor = () => screen.findByRole("dialog", { name: "Condition 2 of 3 Last played" })

describe("TokenPicker below md", () => {
  it("opens a bottom Sheet with a grabber, a Close button, the header actions and a sticky footer", async () => {
    const user = userEvent.setup()
    render(<Harness headerActions={<Button aria-label="More actions for this condition">...</Button>} />)
    await user.click(token())

    const sheet = await editor()
    expect(sheet).toHaveAttribute("data-shell", "sheet")
    expect(sheet).toHaveAttribute("data-testid", "admin-cleanup-condition-editor")
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet.querySelector("[data-slot=sheet-grabber]")).not.toBeNull()
    expect(screen.getByRole("button", { name: "More actions for this condition" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-condition-editor-close")).toHaveAccessibleName("Close")
    expect(sheet.querySelector("[data-slot=token-picker-footer]")).toHaveClass("sticky", "bottom-0", "bg-popover")
    expect(token()).toHaveAttribute("aria-expanded", "true")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("traps focus, and the Close button cancels and returns focus to the token", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    await user.click(token())
    const sheet = await editor()
    await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement))

    for (let i = 0; i < 6; i++) {
      await user.tab()
      // A focus guard at either end hands focus back into the Sheet.
      await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement))
    }

    await user.click(screen.getByTestId("admin-cleanup-condition-editor-close"))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { cancel: true })
    await waitFor(() => expect(token()).toHaveFocus())
  })

  it("hands the shell to a footer function", async () => {
    const user = userEvent.setup()
    const shells: TokenPickerShell[] = []
    render(<Harness footerShells={shells} />)
    await user.click(token())
    await editor()
    expect(shells.at(-1)).toBe("sheet")
  })
})

describe("TokenPicker from md", () => {
  beforeEach(() => {
    wide = true
  })

  it("opens a non-modal Popover, 25rem wide and as tall as the room, with a sticky footer and no header actions", async () => {
    const user = userEvent.setup()
    const shells: TokenPickerShell[] = []
    render(<Harness headerActions={<Button aria-label="More actions for this condition">...</Button>} footerShells={shells} />)
    await user.click(token())

    const popover = await editor()
    expect(popover).toHaveAttribute("data-shell", "popover")
    expect(popover).toHaveClass("w-[25rem]", "max-h-(--available-height)", "overflow-y-auto")
    expect(popover.parentElement).toHaveClass("z-(--z-dropdown)")
    expect(popover.querySelector("[data-slot=token-picker-footer]")).toHaveClass("sticky", "bottom-0")
    expect(screen.queryByRole("button", { name: "More actions for this condition" })).toBeNull()
    expect(screen.queryByTestId("admin-cleanup-condition-editor-close")).toBeNull()
    expect(shells.at(-1)).toBe("popover")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("puts focus on the given control, and Esc cancels and returns focus to the token", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<Harness onOpenChange={onOpenChange} focusDone />)
    token().focus()
    await user.keyboard("{Enter}")
    await editor()
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-condition-editor-done")).toHaveFocus())

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { cancel: true })
    await waitFor(() => expect(token()).toHaveFocus())
  })

  it("applies on Tab from Done, and moves focus to the stop after the row", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<Harness onOpenChange={onOpenChange} focusDone />)
    await user.click(token())
    await editor()
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-condition-editor-done")).toHaveFocus())

    await user.tab()
    expect(screen.getByRole("button", { name: "Add condition" })).toHaveFocus()
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { cancel: false })
    expect(screen.getByRole("button", { name: "Add condition" })).toHaveFocus()
  })

  it("goes back to the token on Shift Tab from its first control, and Tab inside moves on", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(token())
    await editor()
    const field = screen.getByRole("button", { name: "Field: Last played" })
    await waitFor(() => expect(field).toHaveFocus())

    await user.tab()
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
    await user.tab({ shift: true })
    expect(field).toHaveFocus()
    await user.tab({ shift: true })
    expect(token()).toHaveFocus()
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("applies on an outside press, and stays open on a press of the token", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    await user.click(token())
    await editor()

    await user.click(token())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    await user.click(document.body)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { cancel: false })
  })

  it("returns focus to a given element instead of the token", async () => {
    const user = userEvent.setup()
    render(<Harness focusOther />)
    await user.click(token())
    await editor()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.getByRole("button", { name: "Add condition" })).toHaveFocus())
  })

  it("keeps the shell it opened in until the next open", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(token())
    expect(await editor()).toHaveAttribute("data-shell", "popover")

    setWide(false)
    expect(screen.getByRole("dialog")).toHaveAttribute("data-shell", "popover")

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await user.click(token())
    expect(await editor()).toHaveAttribute("data-shell", "sheet")
  })
})
