import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { Search } from "lucide-react"
import { createRef } from "react"

import { Input } from "@/components/ui/input"
import { StyledInput } from "@/components/ui/styled-input"

expect.extend(toHaveNoViolations)

const classesOf = (element: Element) => Array.from(element.classList)

describe("Input", () => {
  it("is 40px with 16px text below md and 36px from md, so iOS does not zoom on focus", () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByRole("textbox")).toHaveClass("h-10", "text-base", "md:h-9", "md:text-ui")
  })

  it("uses the input surface and never a focus: class", () => {
    render(<Input aria-label="Name" />)
    const input = screen.getByRole("textbox")
    expect(input).toHaveClass("bg-background", "border-input", "focus-visible:border-ring", "aria-invalid:border-destructive")
    expect(classesOf(input).filter((name) => name.startsWith("focus:"))).toEqual([])
    expect(input).toHaveAttribute("data-slot", "input")
  })

  it("accepts typing and calls onChange", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Input aria-label="Name" onChange={onChange} />)

    await user.type(screen.getByRole("textbox"), "Plex")

    expect(screen.getByRole("textbox")).toHaveValue("Plex")
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it("forwards ref and data-testid to the input", () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input aria-label="Name" ref={ref} data-testid="name-input" />)
    expect(ref.current).toBe(screen.getByTestId("name-input"))
  })

  it("is not editable when disabled", async () => {
    const user = userEvent.setup()
    render(<Input aria-label="Name" disabled />)
    await user.type(screen.getByRole("textbox"), "x")
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("textbox")).toHaveValue("")
  })

  it("puts leading and trailing slots in a group that carries the surface", async () => {
    const { container } = render(
      <Input aria-label="Invite" leading={<span>discord.gg/</span>} trailing={<Search aria-hidden="true" />} />
    )
    const group = container.querySelector("[data-slot=input-group]")
    expect(group).toHaveClass("border-input", "h-10", "md:h-9")
    expect(group).toHaveTextContent("discord.gg/")
    expect(group?.querySelector("input")).toBe(screen.getByRole("textbox"))
    expect(await axe(container)).toHaveNoViolations()
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <>
        <label htmlFor="url">URL</label>
        <Input id="url" placeholder="https://plex.example.com" />
      </>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe("StyledInput (deprecated adapter)", () => {
  it.each([
    ["sm", ["h-8", "md:h-8"]],
    ["md", ["h-10", "md:h-9"]],
    ["lg", ["h-11", "md:h-11"]],
  ] as const)("maps size %s to %p", (size, classes) => {
    render(<StyledInput size={size} data-testid="input" />)
    expect(screen.getByTestId("input")).toHaveClass(...classes)
  })

  it("maps error to aria-invalid", () => {
    const { rerender } = render(<StyledInput error data-testid="input" />)
    expect(screen.getByTestId("input")).toHaveAttribute("aria-invalid", "true")

    rerender(<StyledInput error={false} data-testid="input" />)
    expect(screen.getByTestId("input")).not.toHaveAttribute("aria-invalid")
  })

  it("defaults the test id to setup-input-<name>, which the setup-wizard spec reads", () => {
    const { rerender } = render(<StyledInput name="url" />)
    expect(screen.getByTestId("setup-input-url")).toHaveAttribute("name", "url")

    rerender(<StyledInput name="url" data-testid="explicit" />)
    expect(screen.getByTestId("explicit")).toBeInTheDocument()
    expect(screen.queryByTestId("setup-input-url")).not.toBeInTheDocument()

    rerender(<StyledInput />)
    expect(screen.getByRole("textbox")).not.toHaveAttribute("data-testid")
  })

  it("passes value, type, placeholder, className and ref through", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const ref = createRef<HTMLInputElement>()
    render(
      <StyledInput
        ref={ref}
        type="url"
        placeholder="https://"
        defaultValue="http://"
        className="max-w-sm"
        onChange={onChange}
        data-testid="input"
      />
    )

    const input = screen.getByTestId("input")
    expect(ref.current).toBe(input)
    expect(input).toHaveAttribute("type", "url")
    expect(input).toHaveAttribute("placeholder", "https://")
    expect(input).toHaveClass("max-w-sm", "bg-background")
    await user.type(input, "x")
    expect(input).toHaveValue("http://x")
    expect(onChange).toHaveBeenCalled()
  })

  it("has no axe violations", async () => {
    const { container } = render(<StyledInput aria-label="API key" name="apiKey" error />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
