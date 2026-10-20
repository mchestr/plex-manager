import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"

import { renderStage, stage } from "@/components/rewind/stage/__tests__/stage-fixture"
import { PREFS_KEY } from "@/lib/rewind/stage/prefs"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const TYPES = ["cover", "number", "top-shows", "back-cover"] as const

beforeEach(() => {
  window.localStorage.clear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("rewind-settings"))
  return screen.findByTestId("rewind-settings-sheet")
}

describe("SettingsSheet", () => {
  it("opens from the Settings button on paper, pauses the story, and shows three switches", async () => {
    const user = userEvent.setup()
    renderStage([...TYPES])
    await user.keyboard("{ArrowRight}")
    const sheet = await openSettings(user)
    expect(stage()).toHaveAttribute("data-mode", "sheet")
    expect(sheet).toHaveAttribute("data-field", "paper")

    const switches = within(sheet).getAllByRole("switch")
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "false", "true"])
    expect(within(sheet).getByRole("switch", { name: "Autoplay" })).toBeInTheDocument()
    expect(within(sheet).getByRole("switch", { name: "Slower pacing" })).toBeInTheDocument()
    expect(within(sheet).getByTestId("rewind-shortcuts-switch")).toHaveAccessibleName("Keyboard shortcuts")
    expect(within(sheet).getByTestId("rewind-settings-article")).toHaveAttribute("href", "/rewind/2026/read")
  })

  it("opens from the comma key", async () => {
    const user = userEvent.setup()
    renderStage([...TYPES])
    await user.keyboard(",")
    expect(await screen.findByTestId("rewind-settings-sheet")).toBeInTheDocument()
  })

  it("stores a switch per device, and with shortcuts off K does nothing while Space still pauses", async () => {
    const user = userEvent.setup()
    renderStage([...TYPES])
    await user.keyboard("{ArrowRight}")
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByTestId("rewind-shortcuts-switch"))
    expect(within(sheet).getByTestId("rewind-shortcuts-switch")).toHaveAttribute("aria-checked", "false")
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({ shortcuts: false })

    await user.keyboard("{Escape}")
    expect(stage()).toHaveAttribute("data-mode", "playing")
    stage().focus()
    await user.keyboard("k")
    expect(stage()).toHaveAttribute("data-mode", "playing")
    await user.keyboard(",")
    expect(screen.queryByTestId("rewind-settings-sheet")).not.toBeInTheDocument()
    await user.keyboard(" ")
    expect(stage()).toHaveAttribute("data-mode", "paused")
  })

  it.each([
    [{ copySource: "llm", model: "anthropic:claude-sonnet-5-5" } as const, "Some of the words were written by Claude Sonnet 5.5 (Anthropic)."],
    [{ copySource: "mixed", model: "openai-compatible:qwen3.6:27b" } as const, "Some of the words were written by a model running on this server."],
    [{ copySource: "template", model: null } as const, "Every word here comes from a template."],
  ])("names who wrote the words (%o)", async (copy, line) => {
    const user = userEvent.setup()
    renderStage([...TYPES], { copy })
    const sheet = await openSettings(user)
    expect(within(sheet).getByTestId("rewind-about-words")).toHaveTextContent(line)
  })
})
