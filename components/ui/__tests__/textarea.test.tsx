import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { createRef } from "react"

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
