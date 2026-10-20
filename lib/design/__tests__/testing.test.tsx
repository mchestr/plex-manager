import { render } from "@testing-library/react"

import { expectNoDarkInsideLight } from "@/lib/design/testing"
import { inkProps } from "@/lib/design/tokens"

describe("expectNoDarkInsideLight", () => {
  it("passes sibling inks and a light ink inside a dark one", () => {
    const { container } = render(
      <div data-theme="rewind" {...inkProps("ultramarine")}>
        <section {...inkProps("paper")}>
          <p>Paper popup</p>
        </section>
        <section {...inkProps("forest")} />
      </div>,
    )
    expect(() => expectNoDarkInsideLight(container)).not.toThrow()
  })

  it("fails a dark ink nested in a light one", () => {
    const { container } = render(
      <div data-theme="rewind" {...inkProps("marigold")}>
        <section {...inkProps("petrol")} data-testid="nested" />
      </div>,
    )
    expect(() => expectNoDarkInsideLight(container)).toThrow(/Found \.dark inside \.light:\n<section[^>]*data-field="petrol"/)
  })

  it("fails when the container itself is dark inside a light ancestor", () => {
    const { getByTestId } = render(
      <div className="light">
        <div className="dark" data-testid="inner" />
      </div>,
    )
    expect(() => expectNoDarkInsideLight(getByTestId("inner"))).toThrow("Found .dark inside .light")
  })
})
