import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Route } from "next"

import { BackCoverShare } from "@/components/rewind/pages/back-cover-actions"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import type { IssuePageType } from "@/lib/rewind/registry"

import { StoryStage, type StoryStagePage } from "../story-stage"

import { LLM_COPY, stagePages } from "./stage-fixture"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const TYPES: IssuePageType[] = ["cover", "number", "back-cover"]

function renderStage({ mode, pages = stagePages(TYPES), ownRewindHref }: { mode?: "member" | "preview" | "admin-preview"; pages?: StoryStagePage[]; ownRewindHref?: Route } = {}) {
  return render(
    <div data-theme="rewind">
      <PortalContainerProvider popupProps={{ "data-field": "paper" }}>
        <StoryStage pages={pages} year={2026} archetype="midnight-marathoner" closeHref="/home" copy={LLM_COPY} mode={mode} ownRewindHref={ownRewindHref} />
      </PortalContainerProvider>
    </div>
  )
}

const stage = () => screen.getByTestId("rewind-stage")

/** jsdom has no Fullscreen API: this one enters and leaves at once and reports `fullscreenchange`. */
function fakeFullscreenApi() {
  let element: Element | null = null
  const change = () => document.dispatchEvent(new Event("fullscreenchange"))
  const request = jest.fn(async () => {
    element = document.documentElement
    change()
  })
  const exit = jest.fn(async () => {
    element = null
    change()
  })
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true })
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element })
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request })
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit })
  return {
    request,
    exit,
    /** The browser's own exit: Esc or the back gesture. */
    leave: () => {
      element = null
      change()
    },
  }
}

beforeEach(() => {
  push.mockClear()
  document.documentElement.style.overflow = ""
})

afterEach(() => {
  jest.restoreAllMocks()
  for (const target of [document, document.documentElement]) {
    for (const key of ["fullscreenEnabled", "fullscreenElement", "requestFullscreen", "exitFullscreen"]) Reflect.deleteProperty(target, key)
  }
})

describe("StoryStage full screen", () => {
  it("offers nothing on a member's stage where the browser has no Fullscreen API (iPhone Safari)", () => {
    renderStage()
    expect(screen.queryByTestId("rewind-fullscreen")).not.toBeInTheDocument()
  })

  it("puts the document in full screen on a member's stage, and follows the browser's own exit", async () => {
    const user = userEvent.setup()
    const api = fakeFullscreenApi()
    renderStage()

    await user.click(screen.getByRole("button", { name: "Full screen" }))
    expect(api.request).toHaveBeenCalledWith({ navigationUI: "hide" })
    expect(stage()).toHaveAttribute("data-fullscreen")
    expect(screen.getByTestId("rewind-fullscreen")).toHaveAccessibleName("Exit full screen")

    act(api.leave)
    expect(stage()).not.toHaveAttribute("data-fullscreen")
    expect(screen.getByTestId("rewind-fullscreen")).toHaveAccessibleName("Full screen")
  })

  it("leaves full screen when the story closes", async () => {
    const user = userEvent.setup()
    const api = fakeFullscreenApi()
    const { unmount } = renderStage()
    await user.click(screen.getByTestId("rewind-fullscreen"))
    unmount()
    expect(api.exit).toHaveBeenCalled()
  })

  it("lifts the admin preview out of its frame in any browser, and Esc steps back into the frame before it closes", async () => {
    const user = userEvent.setup()
    renderStage({ mode: "admin-preview" })
    expect(stage()).toHaveClass("absolute", "contain-paint")
    expect(stage()).toHaveAttribute("data-rw-framed")

    await user.click(screen.getByRole("button", { name: "Full screen" }))
    expect(stage()).toHaveAttribute("data-fullscreen")
    expect(stage()).toHaveClass("fixed")
    expect(stage()).not.toHaveClass("absolute")
    // Still framed for the layout: the story, not the desktop spread, whose bars have no Exit full screen.
    expect(stage()).toHaveAttribute("data-rw-framed")
    expect(document.documentElement.style.overflow).toBe("hidden")

    await user.keyboard("{Escape}")
    expect(stage()).not.toHaveAttribute("data-fullscreen")
    expect(stage()).toHaveClass("absolute")
    expect(document.documentElement.style.overflow).toBe("")
    expect(push).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    expect(push).toHaveBeenCalledWith("/home")
  })

  it("also asks the browser for full screen from the admin preview where it can", async () => {
    const user = userEvent.setup()
    const api = fakeFullscreenApi()
    renderStage({ mode: "admin-preview" })
    await user.click(screen.getByTestId("rewind-fullscreen"))
    expect(api.request).toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Exit full screen" }))
    expect(api.exit).toHaveBeenCalled()
    expect(stage()).not.toHaveAttribute("data-fullscreen")
  })

  it("does not offer the article on load inside the admin preview's small frame", () => {
    // jsdom lays the frame out at 0 x 0, far below the scale floor
    renderStage({ mode: "admin-preview" })
    expect(stage()).toHaveAttribute("data-fitted")
    expect(screen.queryByTestId("rewind-article-offer")).not.toBeInTheDocument()
  })
})

describe("StoryStage share in the previews", () => {
  const backCover = (): StoryStagePage[] =>
    stagePages(TYPES).map((page) => (page.type === "back-cover" ? { ...page, content: <BackCoverShare /> } : page))

  it("explains that sharing is off when the back cover's Share the poster is pressed", async () => {
    const user = userEvent.setup()
    renderStage({ mode: "preview", pages: backCover() })
    await user.keyboard("{End}")
    await user.click(screen.getByTestId("rewind-back-cover-share"))

    expect(stage()).toHaveAttribute("data-mode", "sheet")
    expect(screen.getByTestId("rewind-share-off")).toHaveTextContent("Sharing is off in this preview.")
    expect(screen.getByTestId("rewind-share-off-line")).toHaveTextContent("Members share from their own Rewind")
    expect(screen.queryByTestId("rewind-share-off-open")).not.toBeInTheDocument()
  })

  it("links an admin to their own Rewind's share sheet, from Change too", async () => {
    const user = userEvent.setup()
    renderStage({ mode: "admin-preview", pages: backCover(), ownRewindHref: "/rewind/2026?sheet=share" as Route })
    await user.keyboard("{End}")
    await user.click(screen.getByTestId("rewind-privacy-change"))

    expect(screen.getByTestId("rewind-share-off-line")).toHaveTextContent("admin preview of your own Rewind")
    expect(screen.getByTestId("rewind-share-off-open")).toHaveAttribute("href", "/rewind/2026?sheet=share")
  })
})
