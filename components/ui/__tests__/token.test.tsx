import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { Token, type TokenState } from "@/components/ui/token"

expect.extend(toHaveNoViolations)

const chevron = (element: HTMLElement) => element.querySelector("[data-slot=token-chevron]")

describe("Token", () => {
  it("is a button named by its text, its part and Change, with a chevron and no axe violations", async () => {
    const { container } = render(
      <p>
        <Token part="field" data-testid="admin-cleanup-condition-c2-field">
          Last played
        </Token>{" "}
        <Token part="operator" data-testid="admin-cleanup-condition-c2-operator">
          more than
        </Token>{" "}
        <Token part="value" data-testid="admin-cleanup-condition-c2-value">
          365 days
        </Token>{" "}
        <Token part="extra" data-testid="admin-cleanup-condition-c2-extra">
          30 days
        </Token>
      </p>
    )
    const value = screen.getByRole("button", { name: "365 days, value. Change." })
    expect(value).toHaveAttribute("data-testid", "admin-cleanup-condition-c2-value")
    expect(value).toHaveAttribute("aria-haspopup", "dialog")
    expect(value).toHaveAttribute("aria-expanded", "false")
    expect(chevron(value)).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByRole("button", { name: "Last played, field. Change." })).toHaveClass("font-semibold")
    expect(screen.getByRole("button", { name: "more than, operator. Change." })).not.toHaveClass("font-semibold")
    expect(screen.getByRole("button", { name: "30 days, second value. Change." })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("is 36px high below md and 30px from md, on the secondary recipe", () => {
    render(
      <Token part="value" data-testid="t">
        365 days
      </Token>
    )
    expect(screen.getByRole("button")).toHaveClass("h-9", "md:h-7.5", "rounded-md", "bg-secondary", "border-border-strong")
  })

  it("speaks a part label in place of the part word", () => {
    render(
      <Token part="value" partLabel="level" data-testid="admin-cleanup-scope-level">
        Movies
      </Token>
    )
    expect(screen.getByRole("button", { name: "Movies, level. Change." })).toBeInTheDocument()
  })

  it.each<[TokenState, string]>([
    ["open", "border-primary"],
    ["error", "border-destructive"],
    ["notApplicable", "border-dashed"],
    ["incomplete", "border-dashed"],
    ["sourceFailed", "border-warning"],
  ])("draws the %s state", (state, className) => {
    render(
      <Token part="value" state={state} data-testid="t">
        365 days
      </Token>
    )
    const token = screen.getByRole("button")
    expect(token).toHaveAttribute("data-state", state)
    expect(token).toHaveClass(className)
    expect(chevron(token)).not.toBeNull()
  })

  it("is expanded while open", () => {
    render(
      <Token part="value" state="open" data-testid="t">
        365 days
      </Token>
    )
    expect(screen.getByRole("button", { name: "365 days, value. Change." })).toHaveAttribute("aria-expanded", "true")
  })

  it("adds changed to the name and draws a dot", () => {
    render(
      <Token part="value" state="changed" data-testid="t">
        180 days
      </Token>
    )
    const token = screen.getByRole("button", { name: "180 days, value, changed. Change." })
    expect(token.querySelector("[data-slot=token-changed-dot]")).toHaveAttribute("aria-hidden", "true")
  })

  it("names the failed source and marks it with a triangle", () => {
    render(
      <Token part="field" state="sourceFailed" sourceName="Tautulli" data-testid="t">
        Last played
      </Token>
    )
    const token = screen.getByRole("button", { name: "Last played, field, Tautulli failed. Change." })
    expect(token.querySelectorAll("svg")).toHaveLength(2)
  })

  it("carries an error message as its description", () => {
    render(
      <>
        <Token part="value" state="error" aria-describedby="c2-error" data-testid="t">
          0 days
        </Token>
        <p id="c2-error">Enter a whole number of days from 1 to 3650.</p>
      </>
    )
    expect(screen.getByRole("button", { name: "0 days, value. Change." })).toHaveAccessibleDescription(
      "Enter a whole number of days from 1 to 3650."
    )
  })

  it("opens with Enter, Space and Down, and leaves the other keys to the row", async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    const onKeyDown = jest.fn()
    render(
      <Token part="value" onClick={onClick} onKeyDown={onKeyDown} data-testid="t">
        365 days
      </Token>
    )
    await user.tab()
    expect(screen.getByRole("button")).toHaveFocus()
    await user.keyboard("{Enter}")
    await user.keyboard(" ")
    await user.keyboard("{ArrowDown}")
    expect(onClick).toHaveBeenCalledTimes(3)

    await user.keyboard("{ArrowRight}{Alt>}{ArrowDown}{/Alt}")
    expect(onClick).toHaveBeenCalledTimes(3)
    expect(onKeyDown.mock.calls.map(([event]) => event.key)).toContain("ArrowRight")
  })

  it("lets the row take Down for itself", async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(
      <Token part="value" onClick={onClick} onKeyDown={(event) => event.preventDefault()} data-testid="t">
        365 days
      </Token>
    )
    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(onClick).not.toHaveBeenCalled()
  })

  it("renders read only as a muted span with no chevron and no tab stop", async () => {
    const user = userEvent.setup()
    render(
      <>
        <Token part="value" partLabel="level" state="readOnly" aria-describedby="why" data-testid="admin-cleanup-scope-level">
          Movies
        </Token>
        <p id="why">To change the level, move the rule back to Dry run, or duplicate it.</p>
      </>
    )
    const token = screen.getByTestId("admin-cleanup-scope-level")
    expect(token.tagName).toBe("SPAN")
    expect(token).toHaveTextContent(/^Movies$/)
    expect(token).toHaveClass("bg-muted")
    expect(token).toHaveAttribute("aria-describedby", "why")
    expect(chevron(token)).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    await user.tab()
    expect(document.body).toHaveFocus()
  })

  it("renders static as a span with the token look, no button role, no tab stop and no chevron", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Button
        variant="outline"
        aria-label="Last played more than 365 days ago, or never. 13 more without it. Change condition 2 of 3."
        data-testid="admin-cleanup-condition-c2-box"
      >
        <Token part="field" state="static" data-testid="admin-cleanup-condition-c2-box-field">
          Last played
        </Token>
        <Token part="value" state="static" look="error" data-testid="admin-cleanup-condition-c2-box-value">
          0 days
        </Token>
        <Token part="extra" state="static" look="sourceFailed" data-testid="admin-cleanup-condition-c2-box-extra">
          30 days
        </Token>
      </Button>
    )
    const field = screen.getByTestId("admin-cleanup-condition-c2-box-field")
    expect(field.tagName).toBe("SPAN")
    expect(field).not.toHaveAttribute("role")
    expect(field).not.toHaveAttribute("tabindex")
    expect(field).toHaveClass("bg-secondary", "font-semibold", "pointer-events-none")
    expect(chevron(field)).toBeNull()
    expect(screen.getByTestId("admin-cleanup-condition-c2-box-value")).toHaveClass("border-destructive")
    expect(screen.getByTestId("admin-cleanup-condition-c2-box-extra").querySelector("svg")).not.toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(1)

    await user.tab()
    expect(screen.getByTestId("admin-cleanup-condition-c2-box")).toHaveFocus()
    await user.tab()
    expect(document.body).toHaveFocus()
    expect(await axe(container)).toHaveNoViolations()
  })
})
