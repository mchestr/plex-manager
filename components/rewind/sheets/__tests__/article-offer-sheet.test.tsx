import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"

import { renderStage, stage } from "@/components/rewind/stage/__tests__/stage-fixture"
import { fitStage } from "@/lib/rewind/stage/fit-stage"
import { PREFS_KEY, readPrefs } from "@/lib/rewind/stage/prefs"

import { shouldOfferArticle } from "../article-offer-sheet"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const fit = (vw: number, vh: number, rootFontPx = 16) => fitStage({ vw, vh, safeBottom: 0, rootFontPx })

function setViewport(width: number, height: number, rootFontPx = 16) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
  document.documentElement.style.fontSize = `${rootFontPx}px`
}

beforeEach(() => {
  window.localStorage.clear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

afterEach(() => {
  setViewport(1024, 768)
  document.documentElement.style.fontSize = ""
})

describe("shouldOfferArticle", () => {
  it("offers at u 0.77 and at a 21 px root font, not at 0.81, and never once a choice is stored", () => {
    expect(fit(360, 640).u).toBeCloseTo(0.77, 2)
    expect(shouldOfferArticle(fit(360, 640), null)).toBe(true)
    expect(shouldOfferArticle(fit(390, 844, 21), null)).toBe(true)
    expect(fit(390, 664).u).toBeCloseTo(0.81, 2)
    expect(shouldOfferArticle(fit(390, 664), null)).toBe(false)
    expect(shouldOfferArticle(fit(360, 640), "story")).toBe(false)
    expect(shouldOfferArticle(fit(360, 640), "article")).toBe(false)
  })
})

describe("ArticleOfferSheet", () => {
  it("opens on load below the floor with Read as an article first, and stores Play the story anyway", async () => {
    const user = userEvent.setup()
    setViewport(360, 640)
    renderStage(["cover", "number", "back-cover"])
    const offer = await screen.findByTestId("rewind-article-offer")
    expect(offer).toHaveTextContent("The story may be hard to read at this size")
    expect(offer).toHaveAttribute("data-field", "paper")
    const read = screen.getByTestId("rewind-article-offer-read")
    const play = screen.getByTestId("rewind-article-offer-story")
    expect(read.compareDocumentPosition(play) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(read).toHaveAttribute("href", "/rewind/2026/read")

    await user.click(play)
    expect(readPrefs().smallScreenChoice).toBe("story")
    expect(stage()).toHaveAttribute("data-mode", "cover")
  })

  it("opens at a 130% text size", async () => {
    setViewport(390, 844, 21)
    renderStage(["cover", "number", "back-cover"])
    expect(await screen.findByTestId("rewind-article-offer")).toBeInTheDocument()
  })

  it("stays closed when a choice is stored, and on a screen above the floor", () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ smallScreenChoice: "story" }))
    setViewport(360, 640)
    const { unmount } = renderStage(["cover", "number", "back-cover"])
    expect(screen.queryByTestId("rewind-article-offer")).not.toBeInTheDocument()
    unmount()

    window.localStorage.clear()
    setViewport(390, 664)
    renderStage(["cover", "number", "back-cover"])
    expect(screen.queryByTestId("rewind-article-offer")).not.toBeInTheDocument()
  })
})
