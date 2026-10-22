import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"

import { LLM_COPY, stagePages, TABLE } from "@/components/rewind/stage/__tests__/stage-fixture"
import { StoryStage, type StoryStagePage } from "@/components/rewind/stage/story-stage"
import type { IssuePageType } from "@/lib/rewind/registry"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

/** No Server act: the Server tab must not show. */
const TYPES: IssuePageType[] = ["cover", "number", "bookends", "guess", "top-shows", "top-films", "clock", "calendar", "centrefold", "back-cover"]

function renderSpread(types: IssuePageType[] = TYPES) {
  const pages: StoryStagePage[] = stagePages(types).map((page) => ({
    ...page,
    notes: [{ kind: "paragraph", text: [{ kind: "text", text: `Notes for ${page.type}` }] }],
  }))
  return render(
    <div data-theme="rewind">
      <StoryStage pages={pages} year={2026} serverName="Chester Family Plex" archetype="midnight-marathoner" closeHref="/home" copy={LLM_COPY} />
    </div>
  )
}

const current = () => screen.getAllByTestId("rewind-page").find((page) => page.hasAttribute("data-current"))
const rail = () => screen.getByRole("navigation", { name: "Contents" })

const realMatchMedia = window.matchMedia
afterAll(() => {
  window.matchMedia = realMatchMedia
})

function mockSpread(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({ matches, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() }))
}

beforeEach(() => {
  push.mockClear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
  mockSpread(true)
})

describe("The desktop spread (P7.4)", () => {
  it("renders beside the phone chrome, with the brand and its own test ids", () => {
    renderSpread()
    expect(screen.getByTestId("rewind-spread")).toHaveClass("hidden", "rw-spread:block")
    expect(screen.getByTestId("rewind-chrome-top")).toHaveClass("rw-spread:hidden")
    expect(screen.getByTestId("rewind-spread-top-bar")).toHaveTextContent("Chester Family PlexRewind 2026")
    expect(screen.getByTestId("rewind-spread-progress")).toHaveAttribute("aria-hidden", "true")
  })

  it("jumps to each act's first selected page and skips empty acts", async () => {
    const user = userEvent.setup()
    renderSpread()
    const acts = screen.getByRole("navigation", { name: "Acts" })
    expect(within(acts).getAllByRole("button").map((b) => b.textContent)).toEqual(["Front", "Features", "Habits", "Centrefold", "Back"])
    expect(screen.getByTestId("rewind-spread-act-front")).toHaveAttribute("aria-current", "true")

    await user.click(screen.getByTestId("rewind-spread-act-habits"))
    expect(current()).toHaveAttribute("data-index", "6")
    expect(screen.getByTestId("rewind-spread-act-habits")).toHaveAttribute("aria-current", "true")
    expect(screen.getByTestId("rewind-spread-act-front")).not.toHaveAttribute("aria-current")

    await user.click(screen.getByTestId("rewind-spread-act-features"))
    expect(current()).toHaveAttribute("data-index", "3")
  })

  it("marks the current page in the rail and turns to a page from it", async () => {
    const user = userEvent.setup()
    renderSpread()
    const items = within(rail()).getAllByTestId("rewind-rail-item")
    expect(items.map((item) => item.textContent)).toContain("05Top shows")
    expect(items[0]).toHaveAttribute("aria-current", "page")

    await user.click(items[8])
    expect(current()).toHaveAttribute("data-index", "8")
    expect(within(rail()).getAllByTestId("rewind-rail-item")[8]).toHaveAttribute("aria-current", "page")
    expect(within(rail()).getAllByTestId("rewind-rail-item").filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1)
    expect(screen.getByTestId("rewind-keyboard-legend")).toHaveTextContent("Letter keys work while the page has focus. Turn them off in Settings.")
  })

  it("labels the previous and next buttons with their destinations", async () => {
    const user = userEvent.setup()
    renderSpread()
    expect(screen.queryByTestId("rewind-spread-prev")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-spread-next")).toHaveAccessibleName("Next page: 02 The number")

    await user.click(screen.getByTestId("rewind-spread-act-features"))
    await user.click(screen.getByTestId("rewind-spread-next"))
    expect(current()).toHaveAttribute("data-index", "4")
    expect(screen.getByTestId("rewind-spread-prev")).toHaveAccessibleName("Previous page: 04 Guess")
    expect(screen.getByTestId("rewind-spread-next")).toHaveAccessibleName("Next page: 06 Top films")

    await user.click(screen.getByTestId("rewind-spread-prev"))
    expect(current()).toHaveAttribute("data-index", "3")
  })

  it("toggles Show as table with T on the spread, and Esc still closes", async () => {
    const user = userEvent.setup()
    renderSpread()
    await user.click(screen.getByTestId("rewind-spread-act-features"))
    await user.click(screen.getByTestId("rewind-spread-next"))
    expect(screen.getByRole("complementary", { name: "Notes on page 05, Top shows" })).toHaveTextContent("Notes for top-shows")

    screen.getByTestId("rewind-stage").focus()
    await user.keyboard("t")
    expect(screen.getByTestId("rewind-stage")).not.toHaveAttribute("data-mode", "sheet")
    expect(screen.getByTestId("rewind-notes-body")).toHaveAttribute("data-view", "table")
    expect(within(screen.getByTestId("rewind-notes-body")).getByRole("table")).toHaveAccessibleName(TABLE.caption)
    expect(screen.getByTestId("rewind-notes-table-toggle")).toHaveAttribute("aria-pressed", "true")

    await user.keyboard("t")
    expect(screen.getByTestId("rewind-notes-body")).toHaveAttribute("data-view", "notes")

    await user.keyboard("{Escape}")
    expect(push).toHaveBeenCalledWith("/home")
  })

  it("opens the Table sheet with T on a phone", async () => {
    mockSpread(false)
    const user = userEvent.setup()
    renderSpread()
    await user.click(screen.getByTestId("rewind-spread-act-features"))
    await user.click(screen.getByTestId("rewind-spread-next"))
    screen.getByTestId("rewind-stage").focus()
    await user.keyboard("t")
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "sheet")
  })

  it("leaves the arrow keys to the Notes and the rail", async () => {
    const user = userEvent.setup()
    renderSpread()
    within(rail()).getAllByTestId("rewind-rail-item")[0].focus()
    await user.keyboard("{ArrowRight}")
    expect(current()).toHaveAttribute("data-index", "0")
  })

  it("offers no share in preview mode", () => {
    render(
      <div data-theme="rewind">
        <StoryStage pages={stagePages(TYPES)} year={2026} archetype={null} closeHref="/home" copy={LLM_COPY} mode="preview" />
      </div>
    )
    expect(screen.queryByTestId("rewind-spread-share")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-notes-formats")).not.toBeInTheDocument()
  })
})
