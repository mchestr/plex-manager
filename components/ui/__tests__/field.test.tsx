import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

expect.extend(toHaveNoViolations)

const describedBy = (element: HTMLElement) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)

describe("Field", () => {
  it("labels the control, and clicking the label focuses it", async () => {
    const user = userEvent.setup()
    render(
      <Field>
        <FieldLabel>Server name</FieldLabel>
        <Input />
      </Field>
    )

    const input = screen.getByLabelText("Server name")
    expect(screen.getByText("Server name").closest("label")).toHaveAttribute("for", input.id)

    await user.click(screen.getByText("Server name"))
    expect(input).toHaveFocus()
  })

  it("lists the description and error ids in aria-describedby", () => {
    render(
      <Field invalid>
        <FieldLabel>Tautulli URL</FieldLabel>
        <Input />
        <FieldDescription>Include the port, such as :8181.</FieldDescription>
        <FieldError>Enter a URL that starts with http:// or https://.</FieldError>
      </Field>
    )

    const input = screen.getByLabelText("Tautulli URL")
    const description = screen.getByText("Include the port, such as :8181.")
    const error = screen.getByText("Enter a URL that starts with http:// or https://.").closest("[data-slot=field-error]")
    expect(describedBy(input)).toEqual(expect.arrayContaining([description.id, error?.id]))
    expect(error?.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("sets aria-invalid only while invalid", () => {
    const { rerender } = render(
      <Field>
        <FieldLabel>API key</FieldLabel>
        <Input />
      </Field>
    )
    expect(screen.getByLabelText("API key")).not.toHaveAttribute("aria-invalid")

    rerender(
      <Field invalid>
        <FieldLabel>API key</FieldLabel>
        <Input />
        <FieldError>Enter the API key.</FieldError>
      </Field>
    )
    expect(screen.getByLabelText("API key")).toHaveAttribute("aria-invalid", "true")
  })

  it("wires a Textarea the same way", () => {
    render(
      <Field invalid>
        <FieldLabel>Message</FieldLabel>
        <Textarea />
        <FieldDescription>Markdown is allowed.</FieldDescription>
      </Field>
    )

    const textarea = screen.getByLabelText("Message")
    expect(textarea.tagName).toBe("TEXTAREA")
    expect(textarea).toHaveAttribute("aria-invalid", "true")
    expect(describedBy(textarea)).toContain(screen.getByText("Markdown is allowed.").id)
  })

  it("renders (optional) beside the label text", () => {
    render(
      <>
        <Field>
          <FieldLabel optional>Discord invite</FieldLabel>
          <Input />
        </Field>
        <Label htmlFor="plain" optional>
          Notes
        </Label>
        <input id="plain" />
      </>
    )

    expect(screen.getAllByText("(optional)")).toHaveLength(2)
    expect(screen.getByLabelText("Discord invite (optional)")).toBeInTheDocument()
    expect(screen.getByLabelText("Notes (optional)")).toHaveAttribute("id", "plain")
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <Field invalid>
        <FieldLabel optional>Overseerr URL</FieldLabel>
        <Input />
        <FieldDescription>Members request titles here.</FieldDescription>
        <FieldError>Overseerr didn&apos;t answer at this address.</FieldError>
      </Field>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe("FormField", () => {
  it("names the control and wires the description, change note and error", async () => {
    const { container } = render(
      <form>
        <FormField
          name="overseerrUrl"
          label="Overseerr URL"
          description="Members request titles here."
          changedFrom="http://localhost:5055"
          error="Overseerr didn't answer at this address."
        >
          <Input />
        </FormField>
      </form>
    )

    const input = screen.getByLabelText("Overseerr URL")
    expect(input).toHaveAttribute("name", "overseerrUrl")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(describedBy(input)).toEqual(
      expect.arrayContaining([
        screen.getByText("Members request titles here.").id,
        screen.getByText("Changed from http://localhost:5055").id,
      ])
    )
    expect(screen.getByText("Overseerr didn't answer at this address.")).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("shows no error and no aria-invalid without an error", () => {
    render(
      <FormField name="serverName" label="Server name" optional>
        <Input />
      </FormField>
    )

    expect(screen.getByLabelText("Server name (optional)")).not.toHaveAttribute("aria-invalid")
    expect(document.querySelector("[data-slot=field-error]")).not.toBeInTheDocument()
  })
})
