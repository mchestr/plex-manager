import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"

expect.extend(toHaveNoViolations)

function GlobalLine({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} data-testid="line">
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />} data-testid="line-toggle">
        Show each
      </CollapsibleTrigger>
      <CollapsiblePanel data-testid="line-panel">
        <p>Played in the last 30 days</p>
      </CollapsiblePanel>
    </Collapsible>
  )
}

describe("Collapsible", () => {
  it("opens and closes its panel from the trigger", async () => {
    const user = userEvent.setup()
    render(<GlobalLine />)
    const trigger = screen.getByRole("button", { name: "Show each" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Played in the last 30 days")).not.toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    const panel = screen.getByTestId("line-panel")
    expect(panel).toHaveTextContent("Played in the last 30 days")
    expect(trigger).toHaveAttribute("aria-controls", panel.id)

    await user.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Played in the last 30 days")).not.toBeInTheDocument()
  })

  it("toggles with Enter and Space", async () => {
    const user = userEvent.setup()
    render(<GlobalLine />)
    const trigger = screen.getByRole("button", { name: "Show each" })
    trigger.focus()
    await user.keyboard("{Enter}")
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    await user.keyboard(" ")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).toHaveFocus()
  })

  it("renders a Button trigger in its own style and marks every part", () => {
    render(<GlobalLine defaultOpen />)
    const trigger = screen.getByTestId("line-toggle")
    expect(trigger).toHaveAttribute("data-slot", "collapsible-trigger")
    // The Button keeps its own size and radius
    expect(trigger).toHaveClass("h-8", "rounded-md")
    expect(trigger).toHaveAttribute("data-panel-open")
    expect(screen.getByTestId("line")).toHaveAttribute("data-slot", "collapsible")
    expect(screen.getByTestId("line-panel")).toHaveAttribute("data-slot", "collapsible-panel")
    expect(screen.getByTestId("line-panel")).toHaveClass("h-(--collapsible-panel-height)", "overflow-hidden")
  })

  it("follows a controlled open state", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    function Controlled() {
      const [open, setOpen] = useState(true)
      return (
        <Collapsible
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next)
            setOpen(next)
          }}
        >
          <CollapsibleTrigger className="text-label">Nov 19</CollapsibleTrigger>
          <CollapsiblePanel>Supernatural</CollapsiblePanel>
        </Collapsible>
      )
    }
    render(<Controlled />)
    expect(screen.getByText("Supernatural")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Nov 19" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByText("Supernatural")).not.toBeInTheDocument()
  })

  it("keeps a hidden panel searchable with hiddenUntilFound", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Show each</CollapsibleTrigger>
        <CollapsiblePanel hiddenUntilFound data-testid="panel">
          Played in the last 30 days
        </CollapsiblePanel>
      </Collapsible>
    )
    expect(screen.getByTestId("panel")).toHaveAttribute("hidden", "until-found")
  })

  it("ignores a disabled trigger", async () => {
    const user = userEvent.setup()
    render(
      <Collapsible disabled>
        <CollapsibleTrigger>Show each</CollapsibleTrigger>
        <CollapsiblePanel>Played in the last 30 days</CollapsiblePanel>
      </Collapsible>
    )
    await user.click(screen.getByRole("button", { name: "Show each" }))
    expect(screen.getByRole("button", { name: "Show each" })).toHaveAttribute("aria-expanded", "false")
  })

  it("has no axe violations open or closed", async () => {
    const user = userEvent.setup()
    const { container } = render(<GlobalLine />)
    expect(await axe(container)).toHaveNoViolations()
    await user.click(screen.getByRole("button", { name: "Show each" }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
