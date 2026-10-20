import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"

import { resetQuizAnswers } from "../quiz-context"
import { StoryStage, type StoryStagePage } from "../story-stage"

import { LLM_COPY } from "./stage-fixture"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }))

const PAGES: StoryStagePage[] = [
  { type: "number", content: <h2 tabIndex={-1}>The number</h2> },
  {
    type: "guess",
    content: (
      <div>
        <h2 tabIndex={-1}>Guess</h2>
        <span data-rw-quiz-pick="" data-testid="pick">
          <img alt="" src="/p.webp" />
        </span>
      </div>
    ),
  },
  {
    type: "top-shows",
    content: (
      <div>
        <h2 tabIndex={-1}>Top shows</h2>
        <span data-rw-match-slot="" data-testid="slot" />
      </div>
    ),
  },
]

const animate = jest.fn(() => ({ cancel: jest.fn(), onfinish: null }))

function pick(kind: "series" | "mixed") {
  window.sessionStorage.setItem("rewind:quiz:2026", JSON.stringify({ key: "series:1", rank: 2, title: "Severance", kind }))
}

function renderStage() {
  render(
    <div data-theme="rewind">
      <StoryStage pages={PAGES} year={2026} archetype={null} closeHref="/home" copy={LLM_COPY} />
    </div>
  )
}

/** Turns from page 1 (number) to the guess, then to Top shows. */
async function turnToTopShows() {
  const user = userEvent.setup()
  await user.keyboard("{ArrowRight}")
  await user.keyboard("{ArrowRight}")
}

beforeEach(() => {
  resetQuizAnswers()
  window.sessionStorage.clear()
  animate.mockClear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const at = this.dataset.testid === "slot" ? { x: 16, y: 300, width: 84, height: 126 } : { x: 30, y: 200, width: 120, height: 180 }
    return { ...at, left: at.x, top: at.y, right: at.x + at.width, bottom: at.y + at.height, toJSON: () => at } as DOMRect
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
})

describe("the quiz match cut", () => {
  it("flies a copy of the chosen tile into the No. 1 slot in the stage layer", async () => {
    pick("series")
    renderStage()
    await turnToTopShows()
    const layer = screen.getByTestId("rewind-match-cut-layer")
    expect(layer.querySelector('[data-testid="rewind-match-cut"] img')).not.toBeNull()
    const [frames, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
    expect(frames[1].transform).toBe("translate(-14px, 100px) scale(0.7, 0.7)")
    expect(options.duration).toBe(375)
  })

  it("does not fly under reduced motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    pick("series")
    renderStage()
    await turnToTopShows()
    expect(animate).not.toHaveBeenCalled()
  })

  it.each([["mixed"], ["none"]])("does not fly for %s", async (kind) => {
    if (kind === "mixed") pick("mixed")
    renderStage()
    await turnToTopShows()
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByTestId("rewind-match-cut-layer")).toBeEmptyDOMElement()
  })
})
