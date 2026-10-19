import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import DevUiPage, { metadata } from "@/app/dev/ui/page"

expect.extend(toHaveNoViolations)

jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

describe("/dev/ui", () => {
  afterEach(() => {
    delete process.env.ENABLE_DEV_UI
  })

  it("is not found unless ENABLE_DEV_UI is 1", () => {
    expect(() => DevUiPage()).toThrow("NEXT_NOT_FOUND")

    process.env.ENABLE_DEV_UI = "true"
    expect(() => DevUiPage()).toThrow("NEXT_NOT_FOUND")
  })

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("shows every primitive under its test id, with no axe violations", async () => {
    process.env.ENABLE_DEV_UI = "1"
    const { container } = render(DevUiPage())

    for (const primitive of ["button", "card", "badge", "status-badge", "alert", "spinner", "skeleton", "icon", "input", "field", "checkbox", "switch", "select"]) {
      expect(screen.getByTestId(`dev-ui-${primitive}`)).toBeInTheDocument()
    }
    expect(await axe(container)).toHaveNoViolations()
  })
})
