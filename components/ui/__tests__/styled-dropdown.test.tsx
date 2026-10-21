import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { DropdownOption, StyledDropdown } from "@/components/ui/styled-dropdown"

expect.extend(toHaveNoViolations)

const options: DropdownOption[] = [
  { value: "all", label: "All" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]

function Controlled(props: Partial<React.ComponentProps<typeof StyledDropdown>>) {
  const [value, setValue] = useState(props.value ?? "")
  return (
    <StyledDropdown
      options={options}
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onChange?.(next)
      }}
    />
  )
}

const trigger = () => screen.getByRole("combobox")

/** Base UI holds the opening popup at `pointer-events: none` for a moment; waits until the option takes a click. */
async function clickable(testId: string) {
  const option = await screen.findByTestId(testId)
  await waitFor(() => {
    for (let node: HTMLElement | null = option; node; node = node.parentElement) {
      expect(getComputedStyle(node).pointerEvents).not.toBe("none")
    }
  })
  return option
}

describe("StyledDropdown (deprecated adapter)", () => {
  describe("rendering", () => {
    it("shows the default placeholder, a custom one, or the selected label", () => {
      const { rerender } = render(<StyledDropdown value="" onChange={jest.fn()} options={options} />)
      expect(trigger()).toHaveTextContent("Select an option")

      rerender(<StyledDropdown value="" onChange={jest.fn()} options={options} placeholder="Choose access" />)
      expect(trigger()).toHaveTextContent("Choose access")

      rerender(<StyledDropdown value="yes" onChange={jest.fn()} options={options} />)
      expect(trigger()).toHaveTextContent("Yes")
    })

    it("shows the placeholder for a value outside the options", () => {
      render(<StyledDropdown value="invalid" onChange={jest.fn()} options={options} />)
      expect(trigger()).toHaveTextContent("Select an option")
    })

    it("applies className to the wrapper and id to the trigger", () => {
      const { container } = render(
        <StyledDropdown value="" onChange={jest.fn()} options={options} className="w-40" id="plex-access" />
      )
      expect(container.firstElementChild).toHaveClass("w-40")
      expect(trigger()).toHaveAttribute("id", "plex-access")
    })

    it("maps size sm to the 32px filter trigger in text-label, never 10px", () => {
      const { rerender } = render(<StyledDropdown value="" onChange={jest.fn()} options={options} size="sm" />)
      expect(trigger()).toHaveClass("h-8", "text-label")
      expect(trigger().className).not.toMatch(/text-\[10px\]/)

      rerender(<StyledDropdown value="" onChange={jest.fn()} options={options} />)
      expect(trigger()).toHaveClass("h-10", "md:h-9", "text-ui")

      rerender(<StyledDropdown value="" onChange={jest.fn()} options={options} size="lg" />)
      expect(trigger()).toHaveClass("h-11", "text-body")
    })
  })

  describe("opening and choosing", () => {
    it("opens on click, lists the options and closes after choosing one", async () => {
      const user = userEvent.setup()
      const onChange = jest.fn()
      render(<Controlled onChange={onChange} />)

      await user.click(trigger())
      expect(await screen.findByRole("listbox")).toBeInTheDocument()
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "Yes", "No"])

      await user.click(screen.getByRole("option", { name: "No" }))
      expect(onChange).toHaveBeenCalledWith("no")
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
      expect(trigger()).toHaveTextContent("No")
    })

    it("works from the keyboard and returns focus to the trigger", async () => {
      const user = userEvent.setup()
      const onChange = jest.fn()
      render(<Controlled value="yes" onChange={onChange} />)

      trigger().focus()
      await user.keyboard("{ArrowDown}")
      await screen.findByRole("listbox")
      await user.keyboard("a")
      await waitFor(() => expect(screen.getByRole("option", { name: "All" })).toHaveAttribute("data-highlighted"))
      await user.keyboard("{Enter}")

      expect(onChange).toHaveBeenCalledWith("all")
      await waitFor(() => expect(trigger()).toHaveFocus())
      expect(trigger()).toHaveAttribute("aria-expanded", "false")
    })

    it("closes on Escape without changing the value", async () => {
      const user = userEvent.setup()
      const onChange = jest.fn()
      render(<Controlled value="yes" onChange={onChange} />)

      await user.click(trigger())
      await screen.findByRole("listbox")
      await user.keyboard("{Escape}")

      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
      expect(onChange).not.toHaveBeenCalled()
      expect(trigger()).toHaveFocus()
    })

    it("marks the selected option", async () => {
      const user = userEvent.setup()
      render(<Controlled value="no" />)

      await user.click(trigger())
      expect(await screen.findByRole("option", { name: "No" })).toHaveAttribute("aria-selected", "true")
      expect(screen.getByRole("option", { name: "Yes" })).toHaveAttribute("aria-selected", "false")
    })

    it("renders option groups under their labels", async () => {
      const user = userEvent.setup()
      render(
        <Controlled
          options={[]}
          optgroups={[
            { label: "OpenAI", options: [{ value: "gpt", label: "GPT" }] },
            { label: "Anthropic", options: [{ value: "claude", label: "Claude" }] },
          ]}
        />
      )

      await user.click(trigger())
      expect(await screen.findByRole("group", { name: "OpenAI" })).toHaveTextContent("GPT")
      expect(screen.getByRole("group", { name: "Anthropic" })).toHaveTextContent("Claude")
    })

    it("renders ReactNode labels", async () => {
      const user = userEvent.setup()
      render(<Controlled options={[{ value: "a", label: <span>Custom label</span> }]} />)

      await user.click(trigger())
      expect(await screen.findByText("Custom label")).toBeInTheDocument()
    })
  })

  describe("disabled", () => {
    it("does not open while disabled", async () => {
      const user = userEvent.setup()
      render(<StyledDropdown value="" onChange={jest.fn()} options={options} disabled />)

      expect(trigger()).toBeDisabled()
      await user.click(trigger())
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })

    it("does not choose a disabled option", async () => {
      const user = userEvent.setup()
      const onChange = jest.fn()
      render(<Controlled options={[options[0], { value: "no", label: "No", disabled: true }]} onChange={onChange} />)

      await user.click(trigger())
      await user.click(await screen.findByRole("option", { name: "No" }))
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe("E2E contracts", () => {
    it("puts the test id on the trigger and <testId>-option-<value> on each option", async () => {
      const user = userEvent.setup()
      render(<Controlled data-testid="users-filter-plex-access" />)

      await user.click(screen.getByTestId("users-filter-plex-access"))
      await user.click(await clickable("users-filter-plex-access-option-yes"))
      expect(screen.getByTestId("users-filter-plex-access")).toHaveTextContent("Yes")
    })

    it("renders its own hidden input with name, value and <testId>-hidden", async () => {
      const user = userEvent.setup()
      render(
        <form aria-label="Setup">
          <Controlled name="provider" value="all" />
        </form>
      )

      const hidden = screen.getByTestId("setup-input-provider-hidden")
      expect(hidden).toHaveAttribute("type", "hidden")
      expect(hidden).toHaveAttribute("name", "provider")
      expect(hidden).toHaveValue("all")
      expect(screen.getByTestId("setup-input-provider")).toBe(trigger())

      await user.click(trigger())
      await user.click(await clickable("setup-input-provider-option-no"))
      expect(hidden).toHaveValue("no")
      const form = screen.getByRole("form", { name: "Setup" }) as HTMLFormElement
      expect(new FormData(form).getAll("provider")).toEqual(["no"])
    })

    it("renders no hidden input without a name", () => {
      const { container } = render(<StyledDropdown value="yes" onChange={jest.fn()} options={options} />)
      expect(container.querySelector('input[type="hidden"]')).not.toBeInTheDocument()
    })
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <>
        <label htmlFor="plex-access">Plex access</label>
        <StyledDropdown value="all" onChange={jest.fn()} options={options} id="plex-access" name="plexAccess" />
      </>
    )
    expect(await axe(container)).toHaveNoViolations()
    expect(screen.getByRole("combobox", { name: "Plex access" })).toBeInTheDocument()
  })
})
