import { render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"

import { RewindPoster } from "@/components/rewind/media/poster"
import { RewindScope } from "@/components/rewind/stage/rewind-scope"

jest.mock("server-only", () => ({}))

const TONE = { spot: "ultramarine", field: "paper" } as const

/** A scope with one 84 px poster, which asks for w=240 at 2x and w=96 at 1x. */
const scoped = (saveData?: boolean) => (
  <RewindScope fontClassName="fonts" saveData={saveData}>
    <RewindPoster titleKey="film:5" title="Dune" width={84} colour="duo" tone={TONE} />
  </RewindScope>
)

const posterW = (root: ParentNode) => new URL(root.querySelector("img")!.getAttribute("src")!, "http://x").searchParams.get("w")

describe("RewindScope in low-end mode (P7.15)", () => {
  let cores: jest.SpyInstance
  beforeEach(() => {
    cores = jest.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(8)
  })
  afterEach(() => jest.restoreAllMocks())

  it("stays off on a capable device", () => {
    const { container } = render(scoped())
    expect(screen.getByTestId("rewind-scope")).not.toHaveAttribute("data-low-end")
    expect(posterW(container)).toBe("240")
  })

  it("sets data-low-end and drops the poster to 1x on a 2-core phone", () => {
    cores.mockReturnValue(2)
    const { container } = render(scoped())
    expect(screen.getByTestId("rewind-scope")).toHaveAttribute("data-low-end", "")
    expect(posterW(container)).toBe("96")
  })

  it("sets it from the Save-Data header in the server render", () => {
    const html = renderToString(scoped(true))
    const host = document.createElement("div")
    host.innerHTML = html
    expect(host.querySelector('[data-testid="rewind-scope"]')).toHaveAttribute("data-low-end", "")
    expect(posterW(host)).toBe("96")
  })

  it("renders the server's answer without Save-Data, so hydration matches", () => {
    cores.mockReturnValue(2)
    const host = document.createElement("div")
    host.innerHTML = renderToString(scoped())
    expect(host.querySelector('[data-testid="rewind-scope"]')).not.toHaveAttribute("data-low-end")
    expect(posterW(host)).toBe("240")
  })
})
