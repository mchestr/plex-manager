import { fireEvent, render, screen } from "@testing-library/react"

import { RewindPoster } from "@/components/rewind/media/poster"

jest.mock("server-only", () => ({}))

const TONE = { spot: "ultramarine", field: "paper" } as const

describe("RewindPoster", () => {
  it("sizes the box in artboard units and picks w from the logical width", () => {
    const { container } = render(<RewindPoster titleKey="series:77" title="Severance" width={32} colour="duo" tone={TONE} />)
    const img = container.querySelector("img")!
    expect(img.getAttribute("src")).toBe("/api/rewind/poster/77?w=96&tone=ultramarine.paper")
    const box = container.querySelector('[data-slot="poster"]') as HTMLElement
    expect(box.style.width).toBe("calc(var(--u) * 32px)")
    expect(box.style.height).toBe("calc(var(--u) * 48px)")
  })

  it("asks a full-colour slot for its page's clash pair", () => {
    const { container } = render(<RewindPoster titleKey="film:5" title="Dune" width={84} colour="full" tone={TONE} priority />)
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/api/rewind/poster/5?w=240&tone=none&clash=ultramarine.paper")
  })

  it("swaps in the halftone title card at the same size when the art fails", () => {
    const { container } = render(<RewindPoster titleKey="series:77" title="The Lord of the Rings: The Rings of Power" width={84} colour="full" tone={TONE} />)
    const box = container.querySelector('[data-slot="poster"]') as HTMLElement
    fireEvent.error(container.querySelector("img")!)
    const card = screen.getByTestId("rewind-title-card")
    expect(card.style.width).toBe("calc(var(--u) * 84px)")
    expect(box.style.height).toBe("calc(var(--u) * 126px)")
    expect(card).toHaveTextContent("Rings of Power")
  })

  it("prints only the first word on a narrow card, and a Jellyfin key goes straight to the card", () => {
    render(<RewindPoster titleKey="series:abc-def" title="Andor: A Star Wars Story" width={32} colour="duo" tone={TONE} />)
    expect(screen.getByTestId("rewind-title-card")).toHaveTextContent(/^Andor:$/)
  })
})
