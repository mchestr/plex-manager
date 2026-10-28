/**
 * The Privacy section (P11.14): when the daily retention sweep runs and when
 * it last finished, with nothing to edit or run.
 */

import { render, screen } from "@testing-library/react"

import { PrivacySection } from "@/components/admin/settings/sections/privacy-section"

describe("PrivacySection", () => {
  it("says when the sweep runs, before its first run", () => {
    render(<PrivacySection lastRun={null} />)

    expect(screen.getByTestId("settings-privacy-section")).toHaveTextContent("A daily sweep deletes old personal data.")
    expect(screen.getByTestId("settings-retention-last-run")).toHaveTextContent("Not run yet.")
  })

  it("shows the last run", () => {
    render(<PrivacySection lastRun={new Date("2027-02-01T03:30:00.000Z")} />)

    const lastRun = screen.getByTestId("settings-retention-last-run")
    expect(lastRun).toHaveTextContent("Last run")
    expect(lastRun.querySelector("time")).toHaveAttribute("datetime", "2027-02-01T03:30:00.000Z")
  })

  it("has nothing to edit or run", () => {
    render(<PrivacySection lastRun={null} />)

    expect(screen.queryByTestId("settings-privacy-edit")).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
