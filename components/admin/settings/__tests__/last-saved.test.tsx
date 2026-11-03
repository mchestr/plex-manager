import { render, screen } from "@testing-library/react"

import { LastSaved } from "@/components/admin/settings/last-saved"

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const SAVED_AT = new Date("2026-11-01T12:00:00Z")

describe("LastSaved", () => {
  it("links the admin who saved to that save's audit event", () => {
    render(<LastSaved id="plex" meta={{ at: SAVED_AT, by: "Dana Whitfield", eventId: "audit-42" }} />)

    const link = screen.getByTestId("settings-last-saved-link-plex")
    expect(link).toHaveAttribute("href", "/admin/audit/audit-42")
    expect(link).toHaveTextContent("by Dana Whitfield")
    expect(screen.getByTestId("settings-plex-last-saved")).toContainElement(link)
  })

  it("renders nothing before the first save", () => {
    const { container } = render(<LastSaved id="plex" meta={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})
