import { fireEvent, render, screen } from "@testing-library/react"

import { Poster, posterSrc } from "@/components/ui/poster"
import { posterWidthFor } from "@/lib/ui/poster-widths"

describe("Poster", () => {
  it("requests the smallest served width that covers its box at 2x", () => {
    expect([48, 96, 160, 240].map(posterWidthFor)).toEqual([96, 240, 480, 480])
    render(<Poster ratingKey="123" title="Severance" size="sm" />)
    const img = screen.getByRole("img", { name: "Severance" })
    expect(img).toHaveAttribute("src", "/api/rewind/poster/123?w=240&tone=none")
    expect(img).toHaveAttribute("width", "96")
    expect(img).toHaveAttribute("height", "144")
    expect(img).toHaveAttribute("loading", "lazy")
    expect(img).toHaveAttribute("decoding", "async")
  })

  it("loads a hero eagerly, and asks for a duotone and a clash pair", () => {
    render(<Poster ratingKey="9" title="Andor" size="xs" w={160} tone={{ spot: "ultramarine", field: "paper" }} priority />)
    const img = screen.getByRole("img")
    expect(img).toHaveAttribute("src", "/api/rewind/poster/9?w=160&tone=ultramarine.paper")
    expect(img).toHaveAttribute("loading", "eager")
    expect(posterSrc("9", 240, "none", { spot: "marigold", field: "marigold" })).toBe("/api/rewind/poster/9?w=240&tone=none&clash=marigold.marigold")
  })

  it("swaps in the fallback at the same box size on error", () => {
    const { container } = render(<Poster ratingKey="123" title="Severance" size="md" style={{ width: 70 }} fallback={<span data-testid="card">Severance</span>} />)
    const box = container.querySelector('[data-slot="poster"]')!
    fireEvent.error(screen.getByRole("img"))
    expect(screen.getByTestId("card")).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(box).toHaveAttribute("data-state", "fallback")
    expect(box).toHaveStyle({ width: "70px" })
  })

  it("shows the palette title card without a rating key, and hides decorative art", () => {
    const { container } = render(<Poster ratingKey={null} title="Jellyfin title" size="xs" decorative />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="poster"]')).toHaveAttribute("aria-hidden", "true")
    expect(container).toHaveTextContent("Jellyfin title")
  })
})
