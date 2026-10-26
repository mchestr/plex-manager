/**
 * The Request limits section: the tier table as editable fields, a save that
 * sends numbers, field errors from the server, and "Run now".
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runRequestTiersNow, updateRequestTierSettings } from "@/actions/admin/request-tiers"
import { RequestTiersSection } from "@/components/admin/settings/sections/request-tiers-section"
import type { RequestTierSettingsData } from "@/lib/data/community-stats"
import { DEFAULT_TIERS } from "@/lib/request-tiers/tiers"

jest.mock("@/actions/admin/request-tiers", () => ({ updateRequestTierSettings: jest.fn(), runRequestTiersNow: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const saved = (patch: Partial<RequestTierSettingsData> = {}): RequestTierSettingsData => ({
  enabled: true,
  runHour: 0,
  tiers: [...DEFAULT_TIERS],
  lastRun: null,
  ...patch,
})

beforeEach(() => jest.clearAllMocks())

describe("RequestTiersSection", () => {
  it("shows a row per tier", () => {
    render(<RequestTiersSection saved={saved()} startedLabel={null} />)

    expect(screen.getByTestId("request-tiers-2-overHours")).toHaveValue(24)
    expect(screen.getByTestId("request-tiers-5-movieLimit")).toHaveValue(0)
    expect(screen.getByTestId("request-tiers-1-overHours")).toHaveAttribute("readonly")
    expect(screen.getByTestId("request-tiers-last-run")).toHaveTextContent("No run yet.")
  })

  it("saves edited tiers as numbers", async () => {
    const user = userEvent.setup()
    jest.mocked(updateRequestTierSettings).mockResolvedValue({ success: true, data: null })
    render(<RequestTiersSection saved={saved()} startedLabel={null} />)

    const movies = screen.getByTestId("request-tiers-2-movieLimit")
    await user.clear(movies)
    await user.type(movies, "5")
    await user.click(screen.getByTestId("settings-request-tiers-save"))

    expect(updateRequestTierSettings).toHaveBeenCalledWith({
      enabled: true,
      runHour: 0,
      tiers: DEFAULT_TIERS.map((tier, index) => (index === 1 ? { ...tier, movieLimit: 5 } : tier)),
    })
    expect(mockShowSuccess).toHaveBeenCalledWith("Request limits saved")
  })

  it("shows the server's message when a save is refused", async () => {
    const user = userEvent.setup()
    jest.mocked(updateRequestTierSettings).mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "Invalid input",
      fieldErrors: { tiers: ["Each tier needs more hours than the one before"] },
    })
    render(<RequestTiersSection saved={saved()} startedLabel={null} />)

    await user.click(screen.getByTestId("request-tiers-add"))
    await user.click(screen.getByTestId("settings-request-tiers-save"))

    expect(await screen.findByTestId("request-tiers-error")).toHaveTextContent("Each tier needs more hours than the one before")
  })

  it("adds a tier above the last and removes the last", async () => {
    const user = userEvent.setup()
    render(<RequestTiersSection saved={saved()} startedLabel={null} />)

    await user.click(screen.getByTestId("request-tiers-add"))
    expect(screen.getByTestId("request-tiers-6-overHours")).toHaveValue(250)

    await user.click(screen.getByTestId("request-tiers-remove"))
    expect(screen.queryByTestId("request-tiers-row-6")).not.toBeInTheDocument()
  })

  it("runs now", async () => {
    const user = userEvent.setup()
    jest.mocked(runRequestTiersNow).mockResolvedValue({ success: true, data: { queued: true } })
    render(<RequestTiersSection saved={saved()} startedLabel={null} />)

    await user.click(screen.getByTestId("request-tiers-run"))

    expect(runRequestTiersNow).toHaveBeenCalledTimes(1)
    expect(mockShowSuccess).toHaveBeenCalledWith("Request limit sync queued")
  })

  it("lists the members whose quota changed in the last run", () => {
    const lastRun = {
      startedAt: new Date("2027-01-02T00:00:00Z"),
      finishedAt: new Date("2027-01-02T00:01:00Z"),
      trigger: "scheduled",
      updated: 1,
      unchanged: 5,
      failed: 0,
      skipped: 2,
      error: null,
      entries: [
        {
          overseerrUserId: 1,
          name: "Sam",
          hours: 31,
          tier: 2,
          status: "updated" as const,
          oldQuota: { movieQuotaLimit: 2, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 },
          newQuota: { movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 },
        },
        {
          overseerrUserId: 2,
          name: "Quiet",
          hours: 1,
          tier: 1,
          status: "unchanged" as const,
          oldQuota: { movieQuotaLimit: 2, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 },
          newQuota: { movieQuotaLimit: 2, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 },
        },
      ],
    }
    render(<RequestTiersSection saved={saved({ lastRun })} startedLabel="Jan 2, 2027, 12:00 AM" />)

    const section = screen.getByTestId("request-tiers-last-run")
    expect(section).toHaveTextContent("Jan 2, 2027, 12:00 AM, scheduled.")
    expect(section).toHaveTextContent("1 updated, 5 unchanged, 0 failed, 2 excluded.")
    expect(section).toHaveTextContent("Sam")
    expect(section).toHaveTextContent("2 movies/week, 1 TV/week to 4 movies/week, 2 TV/week")
    expect(section).not.toHaveTextContent("Quiet")
  })
})
