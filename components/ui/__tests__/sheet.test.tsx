import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

expect.extend(toHaveNoViolations)

function Example({ side, grabber }: { side?: "right" | "bottom"; grabber?: boolean }) {
  return (
    <>
      <button type="button">Before</button>
      <Sheet>
        <SheetTrigger render={<Button />}>Share this page</SheetTrigger>
        <SheetContent side={side} grabber={grabber} data-testid="sheet">
          <SheetHeader>
            <SheetTitle>Share this page</SheetTitle>
            <SheetDescription>Cards never show who else watches.</SheetDescription>
          </SheetHeader>
          <SheetClose render={<Button variant="ghost" />}>Cancel</SheetClose>
          <Button>Save the card</Button>
        </SheetContent>
      </Sheet>
    </>
  )
}

async function open(ui: React.ReactElement) {
  const user = userEvent.setup()
  render(ui)
  await user.click(screen.getByRole("button", { name: "Share this page" }))
  return { user, sheet: await screen.findByRole("dialog", { name: "Share this page" }) }
}

describe("Sheet", () => {
  it("slides from the right by default: 420px, full height, rounded on the left", async () => {
    const { sheet } = await open(<Example />)
    expect(sheet).toHaveAttribute("data-side", "right")
    expect(sheet).toHaveClass("right-0", "h-dvh", "max-w-[420px]", "rounded-l-xl")
    expect(sheet).toHaveAttribute("data-testid", "sheet")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("sits at the bottom with a safe-area inset and an 85dvh cap", async () => {
    const { sheet } = await open(<Example side="bottom" />)
    expect(sheet).toHaveClass("bottom-0", "rounded-t-xl", "max-h-[85dvh]")
    expect(sheet.className).toContain("env(safe-area-inset-bottom)")
    expect(sheet.querySelector("[data-slot=sheet-grabber]")).toBeNull()
  })

  it("draws a decorative grabber that assistive technology skips", async () => {
    const { sheet } = await open(<Example side="bottom" grabber />)
    const grabber = sheet.querySelector("[data-slot=sheet-grabber]")
    expect(grabber).toHaveAttribute("aria-hidden", "true")
    expect(grabber).toHaveClass("h-1", "w-9", "bg-border-strong")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("traps focus, closes on Escape and returns focus to the trigger", async () => {
    const { user, sheet } = await open(<Example side="bottom" grabber />)
    for (let i = 0; i < 4; i++) {
      await user.tab()
      await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement))
    }
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Share this page" })).toHaveFocus()
  })

  it("closes from its Close button, so nothing depends on a drag", async () => {
    const { user } = await open(<Example side="bottom" grabber />)
    await user.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("portals into the provided container ref and spreads popupProps on the popup", async () => {
    function InScope() {
      const root = useRef<HTMLDivElement>(null)
      return (
        <div data-testid="scope" ref={root}>
          <PortalContainerProvider container={root} popupProps={{ "data-field": "paper", className: "light" }}>
            <Example side="bottom" />
          </PortalContainerProvider>
        </div>
      )
    }
    const { sheet } = await open(<InScope />)
    expect(screen.getByTestId("scope")).toContainElement(sheet)
    expect(sheet).toHaveAttribute("data-field", "paper")
    expect(sheet).toHaveClass("light", "bg-popover")
  })
})
