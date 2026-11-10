/**
 * Your Keeps on the Leaving soon page (UX 9.2, 9.2.2, 10.3): the rows and
 * their ids, the dates, the line for a Keep that the admin ended, the End
 * keep dialog, the row that leaves at once and comes back after a failure,
 * the heading that takes focus, and the shared Keep meter.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { KeepsProvider, useKeeps } from "@/components/leaving-soon/keep-button"
import { YourKeeps } from "@/components/leaving-soon/your-keeps"
import type { MyKeepRow } from "@/lib/cleanup/types/member"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: jest.fn(), showSuccess: mockShowSuccess, showError: mockShowError }) }))

const NOW = Date.parse("2026-11-08T12:00:00Z")
const BASE = "leaving-soon-my-keeps"

function keep(id: string, overrides: Partial<MyKeepRow> = {}): MyKeepRow {
  return {
    id,
    item: { itemKey: `movie:tmdb:${id}`, level: "movie", title: `Invented ${id}`, year: 2019, seasonNumber: null, episodeCount: null, seasonCount: null,
      posterKey: null, sectionId: "1", sizeBytes: null },
    until: "2027-02-06T12:00:00.000Z",
    keptAt: "2026-11-08T09:00:00.000Z",
    ...overrides,
  }
}

const ROWS = [
  keep("k1"),
  keep("k2", { keptAt: "2026-11-02T09:00:00.000Z", until: "2027-01-31T09:00:00.000Z" }),
  keep("k3", { keptAt: "2025-12-02T09:00:00.000Z", item: { ...keep("k3").item, level: "season", title: "Invented Show", seasonNumber: 4 } }),
  keep("k4", { endedBy: "admin", endedAt: "2026-11-05T10:00:00.000Z" }),
  keep("k5", { endedBy: "self", endedAt: "2026-11-06T10:00:00.000Z" }),
]

function Meter() {
  return <p data-testid="meter">{useKeeps()?.used}</p>
}

function renderKeeps(rows = ROWS) {
  return render(
    <KeepsProvider keeps={{ enabled: true, limit: 20, used: 3, days: 90 }}>
      <Meter />
      <YourKeeps rows={rows} serverName="Invented Server" />
    </KeepsProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: true, data: { restored: false } })
})

afterEach(() => jest.restoreAllMocks())

describe("YourKeeps", () => {
  it("lists active Keeps and the ones the admin ended, with their ids and dates", () => {
    renderKeeps()
    expect(screen.getByTestId(BASE)).toHaveTextContent("Kept titles stay on Invented Server until the date shown. They also show on Account, under Your data.")
    const heading = screen.getByTestId(`${BASE}-heading`)
    expect(heading).toHaveAttribute("tabindex", "-1")
    expect(heading.tagName).toBe("H2")
    expect(screen.getByTestId(`${BASE}-k1-timestamp`)).toHaveTextContent("Kept today, until Feb 6, 2027")
    expect(screen.getByTestId(`${BASE}-k2-timestamp`)).toHaveTextContent("Kept on Nov 2, until Jan 31, 2027")
    expect(screen.getByTestId(`${BASE}-k3`)).toHaveTextContent("Invented Show, Season 4")
    expect(screen.getByTestId(`${BASE}-k3-timestamp`)).toHaveTextContent("Kept on Dec 2, 2025, until Feb 6, 2027")
    expect(screen.getByTestId(`${BASE}-k4-timestamp`)).toHaveTextContent("Your Keep ended. The server admin ended it on Nov 5, 2026.")
    expect(screen.queryByTestId(`${BASE}-k4-end`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`${BASE}-k5`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`${BASE}-k1-end`)).toHaveAccessibleName("End keep on Invented k1")
  })

  it("says so when the member keeps nothing", () => {
    renderKeeps([])
    expect(screen.getByTestId(BASE)).toHaveTextContent("No Keeps yet. Titles you keep show here.")
  })

  it("asks first, then takes the row out at once and toasts", async () => {
    const user = userEvent.setup()
    renderKeeps()
    await user.click(screen.getByTestId(`${BASE}-k2-end`))
    const dialog = await screen.findByTestId("leaving-soon-end-keep-dialog")
    expect(within(dialog).getByText("End your Keep on Invented k2?")).toBeInTheDocument()
    await user.click(screen.getByTestId("leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(screen.queryByTestId(`${BASE}-k2`)).not.toBeInTheDocument())
    expect(removeMyCleanupKeep).toHaveBeenCalledWith({ keepId: "k2" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Keep ended")
    expect(screen.getByTestId("meter")).toHaveTextContent("2")
    await waitFor(() => expect(screen.getByTestId(`${BASE}-heading`)).toHaveFocus())
  })

  it("puts the row back with the words of the failure", async () => {
    const user = userEvent.setup()
    jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: false, code: "NOT_FOUND", error: "This Keep has already ended." })
    renderKeeps()
    await user.click(screen.getByTestId(`${BASE}-k1-end`))
    await user.click(await screen.findByTestId("leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("That didn't work. Try again."))
    expect(screen.getByTestId(`${BASE}-k1`)).toBeInTheDocument()
    expect(screen.getByTestId("meter")).toHaveTextContent("3")
  })

  it("reads a thrown End keep as the fallback failure, also with no provider", async () => {
    const user = userEvent.setup()
    jest.mocked(removeMyCleanupKeep).mockRejectedValue(new Error("network"))
    render(<YourKeeps rows={[keep("k1")]} serverName="Invented Server" />)
    await user.click(screen.getByTestId(`${BASE}-k1-end`))
    expect(await screen.findByTestId("leaving-soon-end-keep-dialog")).toHaveTextContent("with a full grace period.")
    await user.click(screen.getByTestId("leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("That didn't work. Try again."))
    expect(screen.getByTestId(`${BASE}-k1`)).toBeInTheDocument()
  })
})
