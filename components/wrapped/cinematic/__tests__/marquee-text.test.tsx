import { render, screen } from "@testing-library/react"
import { useReducedMotion } from "motion/react"

import { MarqueeText } from "@/components/wrapped/cinematic/marquee-text"

const GRADIENT = "bg-gradient-to-b from-gold-bright to-gold bg-clip-text text-transparent"

describe("MarqueeText", () => {
  afterEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false)
  })

  it("puts each word in one nowrap span, so lines break only between words", () => {
    const { container } = render(<MarqueeText text="The Midnight Marathoner" />)
    const words = container.querySelectorAll("[data-marquee-word]")
    expect(Array.from(words).map((w) => w.textContent)).toEqual(["The", "Midnight", "Marathoner"])
    for (const word of words) {
      expect(word).toHaveClass("inline-block", "whitespace-nowrap")
      expect(word).toHaveAttribute("aria-hidden", "true")
    }
    // The only break opportunities are the plain spaces between the word spans.
    expect(container.firstElementChild?.textContent).toBe("The Midnight Marathoner")
  })

  it("puts the aria-label on the wrapper", () => {
    render(<MarqueeText text="Midnight Marathoner" />)
    expect(screen.getByLabelText("Midnight Marathoner").querySelectorAll("[data-marquee-word]")).toHaveLength(2)
  })

  it("animates the letters inside each word, keeps the stagger across words and drops the blur at the end", () => {
    const { container } = render(<MarqueeText text="Ab Cd" delay={1} stagger={0.1} />)
    const letters = Array.from(container.querySelectorAll("[data-marquee-word] > span"))
    expect(letters.map((l) => l.textContent)).toEqual(["A", "b", "C", "d"])
    const delays = letters.map((l) => JSON.parse(l.getAttribute("data-transition") ?? "{}").delay)
    expect(delays.map((d: number) => Math.round(d * 10) / 10)).toEqual([1, 1.1, 1.3, 1.4])
    for (const letter of letters) {
      expect(JSON.parse(letter.getAttribute("data-animate") ?? "{}").transitionEnd).toEqual({ filter: "none" })
    }
  })

  it("puts the gradient on the letter spans, not the wrapper", () => {
    const { container } = render(<MarqueeText text="Hi there" letterClassName={GRADIENT} />)
    expect(container.firstElementChild).not.toHaveClass("bg-clip-text")
    for (const letter of container.querySelectorAll("[data-marquee-word] > span")) expect(letter).toHaveClass("bg-clip-text")
  })

  it("renders plain text under reduced motion", () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<MarqueeText text="Hi there" letterClassName={GRADIENT} />)
    expect(container.querySelectorAll("[data-marquee-word]")).toHaveLength(0)
    expect(container.firstElementChild).toHaveTextContent("Hi there")
    expect(container.firstElementChild).toHaveClass("bg-clip-text")
  })
})
