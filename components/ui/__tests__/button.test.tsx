import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import Link from "next/link"
import { createRef } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

expect.extend(toHaveNoViolations)

// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const classesOf = (element: Element) => Array.from(element.classList)

describe("Button", () => {
  it("renders a native button that does not submit by default", async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button>Save</Button>
        <Button type="submit">Send</Button>
      </form>
    )

    const save = screen.getByRole("button", { name: "Save" })
    expect(save.tagName).toBe("BUTTON")
    expect(save).toHaveAttribute("type", "button")
    expect(save).toHaveAttribute("data-slot", "button")

    await user.click(save)
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("renders a link with the render prop and keeps the link role", () => {
    render(
      <Button render={<Link href="/x" />} nativeButton={false} variant="outline">
        Open
      </Button>
    )

    const link = screen.getByRole("link", { name: "Open" })
    expect(link.tagName).toBe("A")
    expect(link).toHaveAttribute("href", "/x")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("calls onClick, and ignores clicks while disabled", async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)

    await user.click(screen.getByRole("button", { name: "Go" }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>
    )
    expect(screen.getByRole("button", { name: "Go" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Go" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("is busy and disabled while loading, keeps focus and keeps both labels in the DOM", async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    const { rerender } = render(
      <Button loading={false} loadingLabel="Saving" onClick={onClick} icon={<Plus data-testid="leading" />}>
        Save
      </Button>
    )
    const button = screen.getByRole("button", { name: "Save" })
    button.focus()
    expect(button).not.toHaveAttribute("aria-busy")

    rerender(
      <Button loading loadingLabel="Saving" onClick={onClick} icon={<Plus data-testid="leading" />}>
        Save
      </Button>
    )

    const busy = screen.getByRole("button", { name: "Saving" })
    expect(busy).toBe(button)
    expect(busy).toHaveAttribute("aria-busy", "true")
    expect(busy).toHaveAttribute("aria-disabled", "true")
    expect(busy).toHaveFocus()
    expect(busy).toHaveTextContent("Save")
    expect(busy.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
    // The idle label (with its icon) stays, hidden, and holds the width.
    expect(screen.getByTestId("leading").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true")

    await user.click(busy)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("forwards data-testid and ref to the button", () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Button ref={ref} data-testid="save-button">
        Save
      </Button>
    )

    expect(screen.getByTestId("save-button")).toBe(ref.current)
  })

  it("uses the base-layer focus ring, never focus: classes", () => {
    render(
      <>
        {(["primary", "secondary", "outline", "ghost", "destructive", "destructive-solid", "link"] as const).map(
          (variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          )
        )}
      </>
    )

    for (const button of screen.getAllByRole("button")) {
      expect(classesOf(button).filter((name) => name.startsWith("focus:"))).toEqual([])
    }
  })

  it("lets className override the recipe", () => {
    render(<Button className="w-full">Wide</Button>)
    expect(screen.getByRole("button", { name: "Wide" })).toHaveClass("w-full")
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <Button>Save</Button>
        <Button variant="ghost" size="icon" aria-label="Add">
          <Plus />
        </Button>
        <Button loading loadingLabel="Saving">
          Save
        </Button>
        <Button render={<Link href="/x" />} nativeButton={false}>
          Open
        </Button>
      </div>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
