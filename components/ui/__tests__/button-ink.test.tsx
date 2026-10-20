import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"

expect.extend(toHaveNoViolations)

describe("Button: the Rewind-only entries", () => {
  it("ink is solid ink that underlines on hover instead of lightening", () => {
    render(<Button variant="ink">Share the poster</Button>)
    expect(screen.getByRole("button")).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
      "border-[1.5px]",
      "border-primary",
      "hover:underline"
    )
    expect(screen.getByRole("button").className).not.toMatch(/hover:bg-primary-hover/)
  })

  it("ink-outline is a 1.5px keyline that reverses out on hover", () => {
    render(<Button variant="ink-outline">Share this page</Button>)
    expect(screen.getByRole("button")).toHaveClass(
      "bg-transparent",
      "text-primary",
      "border-[1.5px]",
      "hover:bg-primary",
      "hover:text-primary-foreground"
    )
  })

  it("pill is 44px and fully rounded", () => {
    render(
      <Button variant="ink-outline" size="pill">
        Share this page
      </Button>
    )
    const button = screen.getByRole("button")
    expect(button).toHaveClass("h-11", "px-5", "rounded-full")
    expect(button).not.toHaveClass("rounded-md")
  })

  it("icon-pill is a named 38px circle with a 44px hit area", async () => {
    const { container } = render(
      <Button variant="ink-outline" size="icon-pill" aria-label="Pause">
        <svg aria-hidden="true" />
      </Button>
    )
    const button = screen.getByRole("button", { name: "Pause" })
    expect(button).toHaveClass("size-[38px]", "rounded-full", "relative", "before:absolute", "before:-inset-[4.5px]")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("requires aria-label on icon-pill at the type level", () => {
    // @ts-expect-error An icon-pill holds only an icon, so it needs aria-label.
    const unnamed = <Button size="icon-pill">x</Button>
    const named = (
      <Button size="icon-pill" aria-label="Close">
        x
      </Button>
    )
    expect([unnamed, named]).toHaveLength(2)
  })
})
