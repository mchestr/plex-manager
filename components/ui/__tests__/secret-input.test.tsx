import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { FormField } from "@/components/ui/form-field"
import { SecretInput, secretInputState } from "@/components/ui/secret-input"
import type { SavedSecret } from "@/lib/security/saved-secret"

expect.extend(toHaveNoViolations)

const SAVED: SavedSecret = { last4: "a91c", origin: "http://localhost:5055" }

function Harness({ saved, currentOrigin, initial = "" }: { saved?: SavedSecret | null; currentOrigin?: string | null; initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <FormField name="key" label="API key">
      <SecretInput value={value} onValueChange={setValue} saved={saved} currentOrigin={currentOrigin} data-testid="key" />
    </FormField>
  )
}

describe("secretInputState", () => {
  it("covers the four states", () => {
    expect(secretInputState("typed", SAVED, "http://other:1")).toBe("entered")
    expect(secretInputState("", null)).toBe("empty")
    expect(secretInputState("", SAVED, "http://localhost:5055")).toBe("saved")
    expect(secretInputState("", SAVED, "http://requests.lan:5055")).toBe("reenter-required")
    expect(secretInputState("", SAVED, null)).toBe("reenter-required")
  })

  it("keeps a fixed-destination secret saved whatever the address", () => {
    expect(secretInputState("", { last4: "3kQ2", origin: null }, "http://anything")).toBe("saved")
    expect(secretInputState("", SAVED)).toBe("saved")
  })

  it("asks again for a stored value the current key cannot read (P11.1), even with a fixed destination", () => {
    expect(secretInputState("", { ...SAVED, unreadable: true }, "http://localhost:5055")).toBe("reenter-required")
    expect(secretInputState("", { last4: "", origin: null, unreadable: true })).toBe("reenter-required")
    expect(secretInputState("typed", { ...SAVED, unreadable: true }, "http://localhost:5055")).toBe("entered")
  })
})

describe("SecretInput", () => {
  it("saved: a masked placeholder ending in last4, a lock and Saved, and no value", async () => {
    const { container } = render(<Harness saved={SAVED} currentOrigin="http://localhost:5055" />)

    const input = screen.getByLabelText("API key")
    expect(input).toHaveValue("")
    expect(input).toHaveAttribute("placeholder", "••••••••••••a91c")
    expect(input).toHaveAttribute("type", "password")
    expect(input).not.toBeRequired()
    expect(screen.getByTestId("key-saved")).toHaveTextContent("Saved")
    expect(input).toHaveAccessibleDescription(/ending in a91c is saved\. Leave this blank to keep it\./)
    expect(screen.queryByRole("button", { name: "Show" })).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("empty: no Show until something is typed", async () => {
    const { container } = render(<Harness saved={null} />)
    expect(screen.getByLabelText("API key")).toHaveValue("")
    expect(screen.queryByRole("button", { name: "Show" })).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("entered: Show and Hide act on the typed value only", async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness saved={SAVED} currentOrigin="http://localhost:5055" />)
    const input = screen.getByLabelText("API key")

    await user.type(input, "new-key")
    expect(input).toHaveValue("new-key")
    expect(screen.queryByTestId("key-saved")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Show" }))
    expect(input).toHaveAttribute("type", "text")
    expect(input).toHaveValue("new-key")
    expect(screen.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-pressed", "true")
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole("button", { name: "Hide" }))
    expect(input).toHaveAttribute("type", "password")
  })

  it("Show never puts the saved last4 into the field as a value", async () => {
    const user = userEvent.setup()
    render(<Harness saved={SAVED} currentOrigin="http://localhost:5055" />)
    const input = screen.getByLabelText("API key")

    await user.type(input, "x")
    await user.click(screen.getByRole("button", { name: "Show" }))
    await user.clear(input)

    expect(input).toHaveValue("")
    expect(screen.queryByDisplayValue(/a91c/)).not.toBeInTheDocument()
    expect(input).toHaveAttribute("type", "password")
  })

  it("reenter-required: empty and required, with the hint linked by aria-describedby", async () => {
    const { container } = render(<Harness saved={SAVED} currentOrigin="http://requests.lan:5055" />)
    const input = screen.getByLabelText("API key")

    expect(input).toHaveValue("")
    expect(input).toBeRequired()
    expect(input).toHaveAttribute("placeholder", "Required")
    expect(input).toHaveAttribute("data-state", "reenter-required")

    const hint = screen.getByTestId("key-reenter")
    expect(hint).toHaveTextContent("Enter it again to use it with the new address. The saved key goes only to localhost:5055.")
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(hint.id)
    expect(await axe(container)).toHaveNoViolations()
  })

  it("unreadable: asks for the key again with the encryption copy", async () => {
    const { container } = render(<Harness saved={{ last4: "", origin: "http://localhost:5055", unreadable: true }} currentOrigin="http://localhost:5055" />)
    const input = screen.getByLabelText("API key")

    expect(input).toBeRequired()
    expect(input).toHaveAttribute("data-state", "reenter-required")
    const hint = screen.getByTestId("key-unreadable")
    expect(hint).toHaveTextContent("The stored key can't be read with the current encryption key. Enter it again.")
    expect(screen.queryByTestId("key-reenter")).not.toBeInTheDocument()
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(hint.id)
    expect(await axe(container)).toHaveNoViolations()
  })
})
