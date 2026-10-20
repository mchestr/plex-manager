import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { InModalProvider, PortalContainerProvider } from "@/components/ui/portal-container"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

expect.extend(toHaveNoViolations)

const services = [
  { value: "plex", label: "Plex" },
  { value: "radarr", label: "Radarr" },
  { value: "sonarr", label: "Sonarr" },
  { value: "tautulli", label: "Tautulli" },
]

function ServiceSelect({ onChange = jest.fn() }: { onChange?: (value: string | null) => void }) {
  const [value, setValue] = useState<string | null>("plex")
  return (
    <form aria-label="Service">
      <Select
        items={services}
        name="service"
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      >
        <SelectTrigger aria-label="Service" data-testid="service">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {services.map((service) => (
            <SelectItem key={service.value} value={service.value} label={service.label}>
              {service.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  )
}

describe("Select", () => {
  it("renders a collapsed combobox trigger showing the selected label", () => {
    render(<ServiceSelect />)

    const trigger = screen.getByRole("combobox", { name: "Service" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).toHaveTextContent("Plex")
    expect(trigger).toHaveAttribute("data-slot", "select-trigger")
  })

  it("opens on ArrowDown, jumps by typeahead, selects on Enter, and Escape returns focus", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<ServiceSelect onChange={onChange} />)

    const trigger = screen.getByRole("combobox", { name: "Service" })
    trigger.focus()
    await user.keyboard("{ArrowDown}")
    expect(await screen.findByRole("listbox")).toBeInTheDocument()
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    await user.keyboard("so")
    await waitFor(() => expect(screen.getByRole("option", { name: "Sonarr" })).toHaveAttribute("data-highlighted"))
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith("sonarr")
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"))
    expect(trigger).toHaveTextContent("Sonarr")
    await waitFor(() => expect(trigger).toHaveFocus())

    await user.keyboard("{ArrowDown}")
    await screen.findByRole("listbox")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("marks the selected option with aria-selected and a check", async () => {
    const user = userEvent.setup()
    render(<ServiceSelect />)

    await user.click(screen.getByRole("combobox", { name: "Service" }))
    const selected = await screen.findByRole("option", { name: "Plex" })
    expect(selected).toHaveAttribute("aria-selected", "true")
    expect(selected.querySelector("svg")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Radarr" })).toHaveAttribute("aria-selected", "false")
  })

  it("renders the popup in the provided container, with its popupProps", async () => {
    const user = userEvent.setup()
    const container = document.createElement("div")
    container.setAttribute("data-testid", "paper")
    document.body.appendChild(container)

    render(
      <PortalContainerProvider container={container} popupProps={{ "data-field": "paper" }}>
        <ServiceSelect />
      </PortalContainerProvider>
    )

    await user.click(screen.getByRole("combobox", { name: "Service" }))
    const listbox = await screen.findByRole("listbox")
    expect(container).toContainElement(listbox)
    expect(container.querySelector("[data-slot=select-content]")).toHaveAttribute("data-field", "paper")
    container.remove()
  })

  it("stacks above a dialog when inside one", async () => {
    const user = userEvent.setup()
    render(
      <InModalProvider>
        <ServiceSelect />
      </InModalProvider>
    )

    await user.click(screen.getByRole("combobox", { name: "Service" }))
    const listbox = await screen.findByRole("listbox")
    expect(listbox.closest(".z-\\(--z-popover-in-modal\\)")).toBeInTheDocument()
  })

  it("submits the value through the form", async () => {
    const user = userEvent.setup()
    render(<ServiceSelect />)

    await user.click(screen.getByRole("combobox", { name: "Service" }))
    await user.click(await screen.findByRole("option", { name: "Tautulli" }))

    const form = screen.getByRole("form", { name: "Service" }) as HTMLFormElement
    await waitFor(() => expect(new FormData(form).get("service")).toBe("tautulli"))
  })

  it("has no axe violations, open or closed", async () => {
    const user = userEvent.setup()
    const { container } = render(<ServiceSelect />)
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByRole("combobox", { name: "Service" }))
    await screen.findByRole("listbox")
    // The portalled list sits outside the test's landmarks; region is a page rule.
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
