/**
 * Keeps in Account's Your data (UX 9.4, TS 13.5, E30): the block above
 * Marks while members can keep titles, with an empty state; while media
 * cleanup or member Keeps are off, only for a member with an active Keep;
 * nothing without a session; and the member's own Keeps read with their id.
 */

import { act, render, screen, within } from "@testing-library/react"

import { AccountKeeps, YourDataSection } from "@/components/account/your-data-section"
import { readCleanupSettingsRow, type CleanupSettingsRow } from "@/lib/cleanup/settings"
import type { MemberLeavingSoonData, MyKeepRow } from "@/lib/cleanup/types/member"
import { getMyKeeps } from "@/lib/data/leaving-soon"
import { getSession } from "@/lib/data/session"
import type { YourData } from "@/lib/member/your-data"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/prisma", () => ({ prisma: {} }))
jest.mock("@/lib/data/session", () => ({ getSession: jest.fn() }))
jest.mock("@/lib/data/leaving-soon", () => ({ getMyKeeps: jest.fn() }))
jest.mock("@/lib/cleanup/settings", () => ({ ...jest.requireActual("@/lib/cleanup/settings"), readCleanupSettingsRow: jest.fn() }))
jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
jest.mock("@/actions/member-data", () => ({ deleteMyMark: jest.fn(), forgetWatchlistItem: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: jest.fn(), showSuccess: jest.fn(), showError: jest.fn() }) }))

const DATA: YourData = { marks: { page: 1, total: 0, rows: [] }, watchlist: { total: 0, rows: [] } }
const KEEP: MyKeepRow = {
  id: "keep-1",
  item: { itemKey: "show:tvdb:1", level: "show", title: "Invented Empire", year: 2010, seasonNumber: null, episodeCount: null, seasonCount: null,
    posterKey: "5001", sectionId: "2", sizeBytes: null },
  until: "2027-02-06T12:00:00.000Z",
  keptAt: "2026-11-08T12:00:00.000Z",
}
const ENDED: MyKeepRow = { ...KEEP, id: "keep-2", endedBy: "admin", endedAt: "2026-11-07T12:00:00.000Z" }

function setup({ live = true, pageEnabled = true, keepsEnabled = true, rows = [KEEP] as MyKeepRow[], session = true } = {}) {
  jest.mocked(getSession).mockResolvedValue(session ? ({ user: { id: "member-1" } } as Awaited<ReturnType<typeof getSession>>) : null)
  const used = rows.filter((row) => !row.endedBy).length
  const keeps: Pick<MemberLeavingSoonData, "keeps" | "myKeeps"> = { keeps: { enabled: keepsEnabled, limit: 20, used, days: 90 }, myKeeps: rows }
  jest.mocked(getMyKeeps).mockResolvedValue(keeps)
  const options = buildOptions({ members: { keepsEnabled, keepDays: 90, keepLimit: 20, pageEnabled } })
  jest.mocked(readCleanupSettingsRow).mockResolvedValue({ enabled: live, pausedAt: null, options } as CleanupSettingsRow)
}

async function renderKeeps() {
  const element = await AccountKeeps()
  return render(<>{element}</>)
}

beforeEach(() => jest.clearAllMocks())

describe("AccountKeeps", () => {
  it("shows the member's Keeps with the count line while members can keep titles", async () => {
    setup()
    await renderKeeps()

    expect(getMyKeeps).toHaveBeenCalledWith("member-1")
    expect(screen.getByRole("heading", { level: 3, name: "Keeps" })).toBeInTheDocument()
    const block = screen.getByTestId("account-keeps")
    expect(block).toHaveTextContent("Titles you kept from Leaving soon. Each one stays until its date. You keep 1 of 20.")
    expect(within(block).getByText("Invented Empire")).toBeInTheDocument()
  })

  it("shows the empty state while members can keep titles and hold none", async () => {
    setup({ rows: [] })
    await renderKeeps()

    expect(screen.getByTestId("account-keeps-empty")).toHaveTextContent("No Keeps")
  })

  it.each([
    ["media cleanup is off", { live: false }],
    ["the member page is off", { pageEnabled: false }],
    ["member Keeps are off", { keepsEnabled: false }],
  ])("still lists an active Keep while %s (E30)", async (_label, flags) => {
    setup(flags)
    await renderKeeps()

    expect(screen.getByTestId("account-keeps")).toHaveTextContent("You keep 1 of 20.")
  })

  it.each([
    ["media cleanup is off", { live: false }],
    ["member Keeps are off", { keepsEnabled: false }],
  ])("renders nothing while %s for a member with no active Keep", async (_label, flags) => {
    setup({ ...flags, rows: [ENDED] })
    const { container } = await renderKeeps()

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing without a session, and reads no Keep", async () => {
    setup({ session: false })
    const { container } = await renderKeeps()

    expect(container).toBeEmptyDOMElement()
    expect(getMyKeeps).not.toHaveBeenCalled()
  })
})

describe("YourDataSection Keeps", () => {
  it("puts Keeps above Marks", async () => {
    setup()
    await act(async () => {
      render(<YourDataSection data={DATA} disclosure="" />)
    })

    const keeps = await screen.findByRole("heading", { level: 3, name: "Keeps" })
    const marks = screen.getByRole("heading", { level: 3, name: "Marks" })
    expect(keeps.compareDocumentPosition(marks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
