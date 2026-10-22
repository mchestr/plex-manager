import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

expect.extend(toHaveNoViolations)

describe("Card", () => {
  it("composes header, title, description, action, content and footer", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Plex</CardTitle>
          <CardDescription>Your media server</CardDescription>
          <CardAction>
            <Button variant="ghost">Edit</Button>
          </CardAction>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Saved</CardFooter>
      </Card>
    )

    const card = screen.getByTestId("card")
    expect(card).toHaveAttribute("data-slot", "card")
    expect(screen.getByRole("heading", { level: 3, name: "Plex" })).toHaveAttribute("data-slot", "card-title")
    expect(screen.getByText("Your media server")).toHaveAttribute("data-slot", "card-description")
    expect(screen.getByRole("button", { name: "Edit" }).parentElement).toHaveAttribute("data-slot", "card-action")
    expect(screen.getByText("Body")).toHaveAttribute("data-slot", "card-content")
    expect(screen.getByText("Saved")).toHaveAttribute("data-slot", "card-footer")
  })

  it("renders children straight into the root without padding", () => {
    render(
      <Card data-testid="card" className="gap-4">
        <span>Child</span>
      </Card>
    )
    const card = screen.getByTestId("card")
    expect(card).toHaveClass("gap-4")
    expect(screen.getByText("Child").parentElement).toBe(card)
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Plex</CardTitle>
          <CardDescription>Your media server</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
