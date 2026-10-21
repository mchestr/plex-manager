import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { HiddenTitles } from "@/components/rewind/hide/hidden-titles"
import { HideProvider, type HideSetup } from "@/components/rewind/hide/hide-context"
import { RowSheet } from "@/components/rewind/sheets/row-sheet"
import { LLM_COPY, stagePages } from "@/components/rewind/stage/__tests__/stage-fixture"
import { StoryStage } from "@/components/rewind/stage/story-stage"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }))

const ROW = { title: "Severance", titleKey: "series:4123", numbers: [["Watched", "41 h"]] as [string, string][] }

function setup(overrides: Partial<HideSetup> = {}): HideSetup {
  return {
    hidden: [],
    actions: { hide: jest.fn(async () => ({ success: true as const, data: null })), unhide: jest.fn(async () => ({ success: true as const, data: null })) },
    watch: <span data-testid="watching" />,
    ...overrides,
  }
}

describe("Hide this title (P7.7)", () => {
  it("hides the row's title after the confirm step, then says when the pages update", async () => {
    const user = userEvent.setup()
    const hide = setup()
    render(
      <HideProvider year={2026} setup={hide}>
        <RowSheet row={ROW} onClose={() => {}} />
        <HiddenTitles />
      </HideProvider>
    )

    await user.click(screen.getByTestId("rewind-hide-title"))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Hide Severance from your Rewind?")
    await user.click(screen.getByTestId("rewind-hide-confirm"))

    expect(hide.actions.hide).toHaveBeenCalledWith({ year: 2026, ratingKey: "4123", kind: "series" })
    expect(await screen.findByTestId("rewind-hide-done")).toHaveTextContent("Hidden. Your pages update in about a minute.")
    expect(within(screen.getByTestId("rewind-hidden-titles")).getByText("Severance")).toBeInTheDocument()
    expect(screen.getByTestId("watching")).toBeInTheDocument()
  })

  it("unhides from the Settings list", async () => {
    const user = userEvent.setup()
    const hide = setup({ hidden: [{ ratingKey: "4123", kind: "series", title: "Severance" }] })
    render(
      <HideProvider year={2026} setup={hide}>
        <HiddenTitles />
      </HideProvider>
    )

    await user.click(screen.getByTestId("rewind-unhide-4123"))

    expect(hide.actions.unhide).toHaveBeenCalledWith({ year: 2026, ratingKey: "4123", kind: "series" })
    expect(await screen.findByText("You have not hidden any titles.")).toBeInTheDocument()
  })

  it.each([
    ["member", true],
    ["preview", false],
  ] as const)("in %s mode, the stage's Settings lists hidden titles: %s",async (mode, shown) => {
    const user = userEvent.setup()
    render(<StoryStage pages={stagePages(["cover", "number"])} year={2026} archetype={null} closeHref="/home" copy={LLM_COPY} hide={setup()} mode={mode} />)

    await user.click(screen.getByTestId("rewind-settings"))
    const sheet = await screen.findByTestId("rewind-settings-sheet")
    expect(within(sheet).queryByTestId("rewind-hidden-titles") !== null).toBe(shown)
  })

  it("offers nothing outside a HideProvider, as in preview mode", () => {
    render(
      <>
        <RowSheet row={ROW} onClose={() => {}} />
        <HiddenTitles />
      </>
    )
    expect(screen.getByTestId("rewind-row-sheet")).toBeInTheDocument()
    expect(screen.queryByTestId("rewind-hide-title")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-hidden-titles")).not.toBeInTheDocument()
  })
})
