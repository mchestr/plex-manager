import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"
import { CloudOff, SearchX, Ticket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

expect.extend(toHaveNoViolations)

const kinds = [
  { kind: "first-use", icon: Ticket, title: "No invites yet", action: "Create invite" },
  { kind: "filtered", icon: SearchX, title: "No users match these filters", action: "Clear filters" },
  { kind: "unavailable", icon: CloudOff, title: "Tautulli isn't answering", action: "Retry" },
] as const

describe("EmptyState", () => {
  it.each(kinds)("renders the $kind kind with its title, description and action", async ({ kind, icon, title, action }) => {
    const { container } = render(
      <EmptyState
        kind={kind}
        icon={icon}
        title={title}
        description="Something to say about it."
        primaryAction={<Button>{action}</Button>}
        secondaryAction={<Button variant="ghost">Learn more</Button>}
        data-testid="empty"
      />
    )
    const empty = screen.getByTestId("empty")
    expect(empty).toHaveAttribute("data-kind", kind)
    expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.getByText("Something to say about it.")).toBeInTheDocument()
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Learn more", action])
    expect(await axe(container)).toHaveNoViolations()
  })

  it("announces only the unavailable kind as a status", () => {
    const { rerender } = render(<EmptyState kind="unavailable" icon={CloudOff} title="Down" description="Retry later." />)
    expect(screen.getByRole("status")).toHaveTextContent("Down")
    rerender(<EmptyState kind="first-use" icon={Ticket} title="None" description="Make one." />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
