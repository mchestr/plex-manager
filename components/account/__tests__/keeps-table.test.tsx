/**
 * The member's Keeps on Account (UX 9.4, 10.3): the line with the count,
 * the columns, the ended rows with who ended them, the End keep dialog with
 * the row that turns ended at once and back after a failure, the empty
 * state and the test ids.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { KeepsTable } from "@/components/account/keeps-table"
import type { MyKeepRow } from "@/lib/cleanup/types/member"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: jest.fn(), showSuccess: mockShowSuccess, showError: mockShowError }) }))

const TABLE = "account-keeps-table"

function keep(id: string, level: "movie" | "show" | "season", overrides: Partial<MyKeepRow> = {}): MyKeepRow {
  return {
    id,
    item: { itemKey: `${level}:tmdb:${id}`, level, title: `Invented ${id}`, year: 2019, seasonNumber: level === "season" ? 3 : null, episodeCount: null,
      seasonCount: null, posterKey: "5001", sectionId: "1", sizeBytes: null },
    until: "2027-02-06T12:00:00.000Z",
    keptAt: "2026-11-08T09:00:00.000Z",
    ...overrides,
  }
}

const ROWS = [
  keep("k1", "show"),
  keep("k2", "movie", { keptAt: "2026-11-02T09:00:00.000Z", until: "2027-01-31T09:00:00.000Z" }),
  keep("k3", "season", { endedBy: "self", endedAt: "2026-11-06T10:00:00.000Z" }),
  keep("k4", "movie", { endedBy: "admin", endedAt: "2026-11-05T10:00:00.000Z" }),
]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: true, data: { restored: false } })
})

describe("KeepsTable", () => {
  it("counts the active Keeps and lists every Keep with its dates and who ended it", () => {
    render(<KeepsTable rows={ROWS} limit={20} />)
    expect(screen.getByTestId("account-keeps")).toHaveTextContent("Titles you kept from Leaving soon. Each one stays until its date. You keep 2 of 20.")
    const show = screen.getByTestId(`${TABLE}-row-k1`)
    expect(show).toHaveTextContent("Invented k1")
    expect(show).toHaveTextContent("Show")
    expect(show).toHaveTextContent("Feb 6, 2027")
    expect(show).toHaveTextContent("Nov 8, 2026")
    expect(screen.getByTestId(`${TABLE}-row-k2`)).toHaveTextContent("Movie")
    expect(screen.getByTestId(`${TABLE}-row-k3`)).toHaveTextContent("Season 3")
    expect(screen.getByTestId(`${TABLE}-row-k3`)).toHaveTextContent("Ended by you on Nov 6, 2026")
    expect(screen.getByTestId(`${TABLE}-row-k4`)).toHaveTextContent("Ended by the server admin on Nov 5, 2026")
    expect(screen.getByTestId(`${TABLE}-actions-k1`)).toBeInTheDocument()
    expect(screen.queryByTestId(`${TABLE}-actions-k3`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`${TABLE}-actions-k4`)).not.toBeInTheDocument()
  })

  it("shows the empty state", () => {
    render(<KeepsTable rows={[]} limit={20} />)
    const empty = screen.getByTestId("account-keeps-empty")
    expect(empty).toHaveTextContent("No Keeps")
    expect(empty).toHaveTextContent("Titles you keep from Leaving soon show here.")
    expect(screen.getByTestId("account-keeps")).toHaveTextContent("You keep 0 of 20.")
  })

  it("asks first, then marks the row ended at once and toasts", async () => {
    const user = userEvent.setup()
    render(<KeepsTable rows={ROWS} limit={20} />)
    await user.click(screen.getByTestId(`${TABLE}-actions-k2`))
    await user.click(await screen.findByTestId(`${TABLE}-actions-k2-end-keep`))
    const dialog = await screen.findByTestId("account-keeps-end-dialog")
    expect(within(dialog).getByText("End your Keep on Invented k2?")).toBeInTheDocument()
    await user.click(screen.getByTestId("account-keeps-end-confirm"))
    await waitFor(() => expect(screen.getByTestId(`${TABLE}-row-k2`)).toHaveTextContent("Ended by you on"))
    expect(removeMyCleanupKeep).toHaveBeenCalledWith({ keepId: "k2" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Keep ended")
    expect(screen.getByTestId("account-keeps")).toHaveTextContent("You keep 1 of 20.")
    expect(screen.queryByTestId(`${TABLE}-actions-k2`)).not.toBeInTheDocument()
  })

  it.each([
    ["a refusal", () => jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: false, code: "CLEANUP_KEEP_LIMIT", error: "x" } as never), "You keep 20 titles. End a Keep to keep this one."],
    ["a throw", () => jest.mocked(removeMyCleanupKeep).mockRejectedValue(new Error("network")), "That didn't work. Try again."],
  ])("puts the row back after %s", async (_case, arrange, words) => {
    const user = userEvent.setup()
    arrange()
    render(<KeepsTable rows={ROWS} limit={20} />)
    await user.click(screen.getByTestId(`${TABLE}-actions-k1`))
    await user.click(await screen.findByTestId(`${TABLE}-actions-k1-end-keep`))
    await user.click(await screen.findByTestId("account-keeps-end-confirm"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(words))
    expect(screen.getByTestId(`${TABLE}-row-k1`)).not.toHaveTextContent("Ended by you")
    expect(screen.getByTestId("account-keeps")).toHaveTextContent("You keep 2 of 20.")
  })
})
