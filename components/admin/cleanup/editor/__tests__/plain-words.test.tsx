import { render, screen, within } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { PlainWords } from "@/components/admin/cleanup/editor/plain-words"

expect.extend(toHaveNoViolations)

describe("PlainWords", () => {
  it("renders the sentence with each value strong, under its heading and note", async () => {
    const { container } = render(
      <PlainWords
        parts={[
          { text: "Movies in the " },
          { text: "Films", strong: true },
          { text: " library that " },
          { text: "were added more than 365 days ago", strong: true },
          { text: "." },
        ]}
      />
    )
    const section = screen.getByTestId("admin-cleanup-plain-words")
    expect(within(section).getByRole("heading", { level: 2, name: "In plain words" })).toBeInTheDocument()
    expect(section).toHaveTextContent("Made from the saved rule and your changes")
    expect(section).toHaveTextContent("Movies in the Films library that were added more than 365 days ago.")
    expect(within(section).getByText("Films").tagName).toBe("STRONG")
    expect(within(section).getByText("were added more than 365 days ago").tagName).toBe("STRONG")
    expect(within(section).getByText("library that", { exact: false }).tagName).toBe("SPAN")
    expect(await axe(container)).toHaveNoViolations()
  })
})
