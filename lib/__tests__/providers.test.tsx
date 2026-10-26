import { render, screen } from "@testing-library/react"
import { MotionConfig } from "motion/react"

import { Providers } from "@/lib/providers"

describe("Providers", () => {
  it("applies the OS reduced-motion setting app-wide", () => {
    render(
      <Providers
        format={{ timeZone: "UTC", locale: "en-US" }}
        serverName="Northfield Plex"
        appearance={{ theme: "dark" }}
      >
        <p>app</p>
      </Providers>
    )

    expect(screen.getByText("app")).toBeInTheDocument()
    expect(jest.mocked(MotionConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ reducedMotion: "user" }),
      undefined
    )
  })
})
