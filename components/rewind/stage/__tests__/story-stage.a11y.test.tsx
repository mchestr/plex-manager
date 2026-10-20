import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MotionConfig, useReducedMotion } from "motion/react"

import { currentPage, renderStage, stage } from "./stage-fixture"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const CORE = ["cover", "number", "bookends", "guess", "top-shows", "top-films", "clock", "calendar", "centrefold", "back-cover"] as const
const segment = () => screen.getByTestId("rewind-progress-current")
const heading = () => currentPage()?.querySelector("h2")

beforeEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

describe("StoryStage semantics", () => {
  it("is a region labelled with the year, with each page a labelled article", () => {
    renderStage([...CORE])
    expect(screen.getByRole("region", { name: "Rewind 2026" })).toBe(stage())
    const pages = screen.getAllByTestId("rewind-page", { hidden: true } as never)
    expect(pages[4]).toHaveAttribute("aria-roledescription", "page")
    expect(pages[4]).toHaveAttribute("aria-label", "Page 5 of 10: Top shows")
    expect(stage().querySelectorAll("span[aria-label], div[aria-label]:not([role])")).toHaveLength(0)
  })

  it("wraps the stage in reduced-motion-aware Motion config", () => {
    renderStage([...CORE])
    expect(jest.mocked(MotionConfig).mock.calls.at(-1)?.[0]).toMatchObject({ reducedMotion: "user" })
  })

  it("focuses the new heading after a member's turn and keeps the live region empty", async () => {
    const user = userEvent.setup()
    renderStage([...CORE])
    await user.keyboard("{ArrowRight}")
    expect(heading()).toHaveTextContent("Heading of number")
    expect(heading()).toHaveFocus()
    expect(screen.getByTestId("rewind-live")).toBeEmptyDOMElement()
    expect(screen.getByTestId("rewind-live")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByTestId("rewind-live")).toHaveAttribute("aria-atomic", "true")
  })

  it("keeps focus where it was on an automatic turn and announces the page once", async () => {
    const user = userEvent.setup()
    renderStage([...CORE])
    await user.keyboard("{ArrowRight}")
    const focused = document.activeElement
    fireEvent.animationEnd(segment())
    expect(currentPage()).toHaveAttribute("data-index", "2")
    expect(document.activeElement).toBe(focused)
    expect(screen.getByTestId("rewind-live")).toHaveTextContent("Page 3 of 10: Bookends")

    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("rewind-live")).toBeEmptyDOMElement()
  })

  it("announces an automatic turn as Page 2 of 10: The number", () => {
    // A timed first page, so the story plays from the start.
    renderStage(["bookends", "number", "guess", "top-shows", "top-films", "clock", "calendar", "cover", "centrefold", "back-cover"])
    expect(stage()).toHaveAttribute("data-mode", "playing")
    expect(screen.getByTestId("rewind-live")).toBeEmptyDOMElement()
    fireEvent.animationEnd(segment())
    expect(screen.getByTestId("rewind-live")).toHaveTextContent("Page 2 of 10: The number")
  })

  it("keeps playing after a member's turn until Tab reaches a control in the page", async () => {
    const user = userEvent.setup()
    renderStage([...CORE])
    // Turn to Top shows (index 4) with a member's turns; focus lands on its heading.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}")
    await user.click(screen.getByTestId("rewind-next"))
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "playing")
    expect(currentPage()).toHaveAttribute("data-index", "4")
    expect(heading()).toHaveFocus()
    expect(stage()).toHaveAttribute("data-mode", "playing")

    await user.tab()
    expect(screen.getByRole("button", { name: "Show all" })).toHaveFocus()
    expect(stage()).toHaveAttribute("data-mode", "paused")

    await user.tab()
    expect(stage()).toHaveAttribute("data-mode", "playing")
  })

  it("puts Read as an article first in the tab order", async () => {
    const user = userEvent.setup()
    renderStage([...CORE])
    expect(stage()).toHaveFocus()
    await user.tab()
    expect(screen.getByTestId("rewind-article-mode")).toHaveFocus()
    expect(screen.getByTestId("rewind-article-mode")).toHaveAttribute("href", "/rewind/2026/read")
  })
})
