import { render, screen, within } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { icons } from "@/lib/ui/icons"

expect.extend(toHaveNoViolations)

function renderScreen(props: Partial<Parameters<typeof StatusScreen>[0]> = {}) {
  return render(
    <main>
      <StatusScreen
        icon={icons.notFound}
        code="404"
        title="This page doesn't exist"
        description="The link may be old, or the page may have moved."
        primaryAction={<Button>Go to home</Button>}
        secondaryAction={<Button variant="secondary">Ask for help on Discord</Button>}
        {...props}
      />
    </main>
  )
}

describe("StatusScreen", () => {
  it("has one h1, the title", () => {
    renderScreen()

    const headings = screen.getAllByRole("heading")
    expect(headings).toHaveLength(1)
    expect(headings[0].tagName).toBe("H1")
    expect(headings[0]).toHaveTextContent("This page doesn't exist")
  })

  it("shows the code in muted mono", () => {
    renderScreen({ code: "abc123" })

    const code = screen.getByTestId("status-screen-code")
    expect(code).toHaveTextContent("abc123")
    expect(code).toHaveClass("font-mono", "text-muted-foreground")
  })

  it("shows no code line without a code", () => {
    renderScreen({ code: undefined })

    expect(screen.queryByTestId("status-screen-code")).not.toBeInTheDocument()
  })

  it("puts the primary action before the secondary", () => {
    renderScreen()

    const names = within(screen.getByTestId("status-screen"))
      .getAllByRole("button")
      .map((button) => button.textContent)
    expect(names).toEqual(["Go to home", "Ask for help on Discord"])
  })

  it("draws the icon as decoration", () => {
    const { container } = renderScreen()

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("has no axe violations", async () => {
    const { container } = renderScreen()

    expect(await axe(container)).toHaveNoViolations()
  })
})
