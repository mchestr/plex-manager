import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Stepper, type StepperStep } from "@/components/ui/stepper"

expect.extend(toHaveNoViolations)

const ONBOARDING: StepperStep[] = [
  { id: "welcome", label: "Welcome", state: "done" },
  { id: "playback", label: "Playback", state: "current" },
  { id: "requests", label: "Requests", state: "upcoming" },
  { id: "support", label: "Support", state: "upcoming" },
  { id: "final", label: "Done", state: "upcoming" },
]

const SETUP: StepperStep[] = [
  { id: "plex", label: "Plex server", group: "Core", state: "done" },
  { id: "tautulli", label: "Tautulli", group: "Core", state: "done" },
  { id: "overseerr", label: "Overseerr", group: "Requests", optional: true, state: "current" },
  { id: "sonarr", label: "Sonarr", group: "Automation", optional: true, state: "skipped" },
  { id: "radarr", label: "Radarr", group: "Automation", optional: true, state: "upcoming" },
]

describe("Stepper", () => {
  describe("horizontal", () => {
    it("marks the current step with aria-current and counts it", () => {
      render(<Stepper steps={ONBOARDING} orientation="horizontal" label="Getting started" meta="About a minute" />)

      const list = screen.getByRole("list", { name: "Getting started, step 2 of 5" })
      const items = within(list).getAllByRole("listitem")
      expect(items).toHaveLength(5)
      expect(items[1]).toHaveAttribute("aria-current", "step")
      expect(items.filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1)
      expect(screen.getByText("Step 2 of 5")).toBeInTheDocument()
      expect(screen.getByText("About a minute")).toBeInTheDocument()
    })

    it("paints the current segment with the indicator token and done ones muted", () => {
      const { container } = render(<Stepper steps={ONBOARDING} orientation="horizontal" />)

      const segments = container.querySelectorAll('[data-slot="stepper-segment"]')
      expect(segments[0]).toHaveClass("bg-muted-foreground")
      expect(segments[1]).toHaveClass("bg-primary-indicator")
      expect(segments[2]).toHaveClass("bg-secondary")
      expect(container.innerHTML).not.toMatch(/\bbg-primary(?![\w-])/)
    })

    it("shows every label for five steps and names the done ones for screen readers", () => {
      render(<Stepper steps={ONBOARDING} orientation="horizontal" />)

      expect(screen.getByText("Welcome")).not.toHaveClass("sr-only")
      expect(screen.getByText(", done")).toHaveClass("sr-only")
    })

    it("appends the current label to the count when asked", () => {
      render(<Stepper steps={SETUP} orientation="horizontal" showCurrentLabel />)

      expect(screen.getByText("Step 3 of 5, Overseerr")).toBeInTheDocument()
    })

    it("has no axe violations", async () => {
      const { container } = render(<Stepper steps={ONBOARDING} orientation="horizontal" label="Getting started" />)

      expect(await axe(container)).toHaveNoViolations()
    })
  })

  describe("vertical", () => {
    it("lists the steps under their group headings with Optional captions", () => {
      render(<Stepper steps={SETUP} orientation="vertical" label="Setup" />)

      for (const group of ["Core", "Requests", "Automation"]) expect(screen.getByText(group)).toBeInTheDocument()
      expect(screen.getAllByText("Core")).toHaveLength(1)
      expect(screen.getAllByText("Optional")).toHaveLength(3)

      const current = screen.getByText("Overseerr").closest("li")
      expect(current).toHaveAttribute("aria-current", "step")
      expect(within(current as HTMLElement).getByText("Optional")).toBeInTheDocument()
      expect(screen.getByText(", skipped")).toHaveClass("sr-only")
      expect(screen.getByRole("list", { name: "Setup, step 3 of 5" })).toBeInTheDocument()
    })

    it("lets done and skipped steps be chosen when onSelect is given", async () => {
      const user = userEvent.setup()
      const onSelect = jest.fn()
      render(<Stepper steps={SETUP} orientation="vertical" onSelect={onSelect} />)

      await user.click(screen.getByRole("button", { name: /^Tautulli\s*, done$/ }))
      await user.click(screen.getByRole("button", { name: /^Sonarr\s*, skipped$/ }))

      expect(onSelect.mock.calls).toEqual([["tautulli"], ["sonarr"]])
      expect(screen.queryByRole("button", { name: /Radarr/ })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Overseerr/ })).not.toBeInTheDocument()
    })

    it("has no axe violations", async () => {
      const { container } = render(<Stepper steps={SETUP} orientation="vertical" label="Setup" />)

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
