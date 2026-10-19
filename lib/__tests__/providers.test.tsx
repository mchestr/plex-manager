import { render, screen } from "@testing-library/react"
import { MotionConfig } from "motion/react"

import { Providers } from "@/lib/providers"

jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("Providers", () => {
  it("applies the OS reduced-motion setting app-wide", () => {
    render(
      <Providers>
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
