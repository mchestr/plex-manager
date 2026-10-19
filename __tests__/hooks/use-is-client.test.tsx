import { renderToString } from "react-dom/server"
import { render, screen } from "@testing-library/react"
import { useIsClient } from "@/hooks/use-is-client"

function Probe() {
  return <span data-testid="probe">{useIsClient() ? "client" : "server"}</span>
}

describe("useIsClient", () => {
  it("is false while rendering on the server", () => {
    expect(renderToString(<Probe />)).toContain("server")
  })

  it("is true once rendered on the client", () => {
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("client")
  })
})
