import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { createRef } from "react"

import { StyledTextarea } from "@/components/ui/styled-textarea"
import { Textarea } from "@/components/ui/textarea"

expect.extend(toHaveNoViolations)

describe("Textarea", () => {
  it("renders a textarea with the input surface and 16px text below md", () => {
    render(<Textarea aria-label="Message" />)
    const textarea = screen.getByRole("textbox")
    expect(textarea.tagName).toBe("TEXTAREA")
    expect(textarea).toHaveClass("bg-background", "border-input", "text-base", "md:text-ui", "resize-y")
    expect(textarea).toHaveAttribute("data-slot", "textarea")
  })

  it("accepts multi-line typing and keeps id, name and ref", async () => {
    const user = userEvent.setup()
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea aria-label="Message" id="msg" name="message" ref={ref} />)

    const textarea = screen.getByRole("textbox")
    await user.type(textarea, "Line one{Enter}Line two")
    expect(textarea).toHaveValue("Line one\nLine two")
    expect(textarea).toHaveAttribute("id", "msg")
    expect(textarea).toHaveAttribute("name", "message")
    expect(ref.current).toBe(textarea)
  })

  it("supports a controlled value", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Textarea aria-label="Message" value="Fixed" onChange={onChange} />)

    await user.type(screen.getByRole("textbox"), "x")
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole("textbox")).toHaveValue("Fixed")
  })

  it("is disabled when disabled", () => {
    render(<Textarea aria-label="Message" disabled />)
    expect(screen.getByRole("textbox")).toBeDisabled()
  })

  it("has no axe violations", async () => {
    const { container } = render(<Textarea aria-label="Message" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe("StyledTextarea (deprecated adapter)", () => {
  it.each([
    ["sm", "py-1.5"],
    ["md", "py-2"],
    ["lg", "py-2.5"],
  ] as const)("maps size %s to %s", (size, padding) => {
    render(<StyledTextarea size={size} data-testid="textarea" />)
    expect(screen.getByTestId("textarea")).toHaveClass(padding)
  })

  it.each([
    ["none", "resize-none"],
    ["vertical", "resize-y"],
    ["horizontal", "resize-x"],
    ["both", "resize"],
  ] as const)("passes resize=%s through as %s", (resize, className) => {
    render(<StyledTextarea resize={resize} data-testid="textarea" />)
    expect(screen.getByTestId("textarea")).toHaveClass(className)
  })

  it("maps error to aria-invalid", () => {
    const { rerender } = render(<StyledTextarea error data-testid="textarea" />)
    expect(screen.getByTestId("textarea")).toHaveAttribute("aria-invalid", "true")

    rerender(<StyledTextarea data-testid="textarea" />)
    expect(screen.getByTestId("textarea")).not.toHaveAttribute("aria-invalid")
  })

  it("defaults the test id to setup-input-<name>", () => {
    const { rerender } = render(<StyledTextarea name="systemPrompt" />)
    expect(screen.getByTestId("setup-input-systemPrompt")).toHaveAttribute("name", "systemPrompt")

    rerender(<StyledTextarea name="systemPrompt" data-testid="explicit" />)
    expect(screen.getByTestId("explicit")).toBeInTheDocument()
  })

  it("passes rows, placeholder, value and ref through", async () => {
    const user = userEvent.setup()
    const ref = createRef<HTMLTextAreaElement>()
    render(<StyledTextarea ref={ref} rows={6} placeholder="Say hello" defaultValue="Hi" data-testid="textarea" />)

    const textarea = screen.getByTestId("textarea")
    expect(ref.current).toBe(textarea)
    expect(textarea).toHaveAttribute("rows", "6")
    expect(textarea).toHaveAttribute("placeholder", "Say hello")
    await user.type(textarea, "!")
    expect(textarea).toHaveValue("Hi!")
  })

  it("has no axe violations", async () => {
    const { container } = render(<StyledTextarea aria-label="Prompt" error />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
