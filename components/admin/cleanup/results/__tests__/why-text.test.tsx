/**
 * WhyText (TS 10.5, UX 4.5, 8.5): the strong parts in bold, and one space
 * between two sentence parts, as a fact list holds one part per sentence.
 */

import { render } from "@testing-library/react"

import { WhyText } from "@/components/admin/cleanup/results/why-text"

describe("WhyText", () => {
  it("puts one space between two sentences, and keeps the strong parts bold (UX review UX-01)", () => {
    const { container } = render(<WhyText parts={[{ text: "Never played." }, { text: "Added to Plex Aug 18, 2025.", strong: true }, { text: "Done" }]} />)
    expect(container.textContent).toBe("Never played. Added to Plex Aug 18, 2025. Done")
    expect(container.querySelector("strong")?.textContent).toBe(" Added to Plex Aug 18, 2025.")
  })
})
