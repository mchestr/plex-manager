/**
 * The impact line of Global protections (UX 7.7 item 4, 8.8): it asks 500 ms
 * after the last change, names each rule that changes, adds the titles that
 * leave Leaving soon, speaks only settled text, and updates "Protects N".
 */

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { previewCleanupProtectionImpact } from "@/actions/admin/cleanup-preview"
import { buildSettingsData } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { IMPACT_DELAY_MS, IMPACT_FAILED, impactWords } from "@/components/admin/cleanup/settings/protection-impact"
import { ProtectionsSection } from "@/components/admin/cleanup/settings/protections-section"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import type { ProtectionImpactResult } from "@/lib/cleanup/types/actions"

jest.mock("@/actions/admin/cleanup-settings", () => ({ updateCleanupSettings: jest.fn() }))
jest.mock("@/actions/admin/cleanup-preview", () => ({ previewCleanupProtectionImpact: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const rule = (name: string, delta: number, level: "movie" | "show" | "season" = "movie") => ({ ruleId: name.toLowerCase().replace(/ /g, "-"), name, level, delta })

const RESULT: ProtectionImpactResult = {
  rules: [rule("Movies nobody watches", 6), rule("Big shows nobody plays", 1, "show"), rule("Old seasons", 0, "season")],
  protects: { g1: 23, g3: 8, g5: 81 },
  leaves: 0,
}

describe("impactWords", () => {
  it("names each rule that changes, then the others", () => {
    expect(impactWords(RESULT)).toBe("Movies nobody watches matches 6 more movies. Big shows nobody plays matches 1 more show. The other rule does not change.")
    expect(impactWords({ ...RESULT, rules: [rule("Seasons", -1, "season"), rule("A", 0), rule("B", 0)] })).toBe(
      "Seasons matches 1 fewer season. The other 2 rules do not change."
    )
  })

  it("says when no rule changes, or none exists", () => {
    expect(impactWords({ ...RESULT, rules: [rule("Only rule", 0)] })).toBe("Only rule does not change.")
    expect(impactWords({ ...RESULT, rules: [rule("A", 0), rule("B", 0)] })).toBe("No rule changes.")
    expect(impactWords({ ...RESULT, rules: [] })).toBe("No rule exists yet.")
  })

  it("adds the titles that leave Leaving soon above 0, and a collection that is not read yet", () => {
    expect(impactWords({ ...RESULT, rules: [rule("A", 2)], leaves: 1 })).toBe("A matches 2 more movies. 1 title leaves Leaving soon at the save.")
    expect(impactWords({ ...RESULT, rules: [rule("A", 2)], leaves: 4 }, true)).toBe(
      "A matches 2 more movies. 4 titles leave Leaving soon at the save. A new Plex collection counts after the next library read."
    )
  })
})

describe("ProtectionImpact in the section", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.mocked(previewCleanupProtectionImpact).mockResolvedValue({ success: true, data: RESULT })
  })
  afterEach(() => jest.useRealTimers())

  async function editing() {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await act(async () => {
      render(<ProtectionsSection data={buildSettingsData()} />)
    })
    await user.click(screen.getByTestId("settings-cleanup-protections-edit"))
    return user
  }

  const settle = async (ms = IMPACT_DELAY_MS) => {
    await act(async () => {
      jest.advanceTimersByTime(ms)
    })
  }

  it("asks 500 ms after the last change, once, and shows the settled line in a polite live region", async () => {
    const user = await editing()
    const line = screen.getByTestId("cleanup-protections-impact")
    expect(line).toHaveAttribute("aria-live", "polite")
    expect(line).toBeEmptyDOMElement()

    const days = screen.getByTestId("cleanup-protections-g5-days")
    await user.clear(days)
    await user.type(days, "120")
    await settle(IMPACT_DELAY_MS - 50)
    expect(previewCleanupProtectionImpact).not.toHaveBeenCalled()
    await settle(50)

    expect(previewCleanupProtectionImpact).toHaveBeenCalledTimes(1)
    const expected = buildOptions().protections
    expected.g5.days = 120
    expect(previewCleanupProtectionImpact).toHaveBeenCalledWith({ protections: expected })
    expect(line).toHaveTextContent(
      "With this change: Movies nobody watches matches 6 more movies. Big shows nobody plays matches 1 more show. The other rule does not change."
    )
    expect(screen.getByTestId("cleanup-protections-g5-row")).toHaveTextContent("Protects 81 titles")
  })

  it("asks nothing while a days field is empty, and clears the line back at the saved values", async () => {
    const user = await editing()
    const days = screen.getByTestId("cleanup-protections-g4-days")
    await user.clear(days)
    await settle()
    expect(previewCleanupProtectionImpact).not.toHaveBeenCalled()

    await user.type(days, "45")
    await settle()
    expect(screen.getByTestId("cleanup-protections-impact")).toHaveTextContent("With this change:")

    await user.clear(days)
    await user.type(days, "30")
    await settle()
    expect(screen.getByTestId("cleanup-protections-impact")).toBeEmptyDOMElement()
  })

  it("keeps only the answer of the newest change", async () => {
    let first: (value: Awaited<ReturnType<typeof previewCleanupProtectionImpact>>) => void = () => undefined
    jest.mocked(previewCleanupProtectionImpact).mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
    const user = await editing()

    await user.click(screen.getByTestId("cleanup-protections-g2-enabled"))
    await settle()
    await user.click(screen.getByTestId("cleanup-protections-g8-enabled"))
    await act(async () => first({ success: true, data: { ...RESULT, rules: [rule("Stale rule", 9)] } }))
    expect(screen.getByTestId("cleanup-protections-impact")).not.toHaveTextContent("Stale rule")

    await settle()
    expect(screen.getByTestId("cleanup-protections-impact")).toHaveTextContent("Movies nobody watches matches 6 more movies.")
  })

  it("shows the refusal or the failure words, and names a collection that is not read yet", async () => {
    jest.mocked(previewCleanupProtectionImpact).mockResolvedValueOnce({ success: false, code: "RATE_LIMITED", error: "Too many previews. Wait a minute." })
    const user = await editing()

    await user.click(screen.getByTestId("cleanup-protections-g2-enabled"))
    await settle()
    expect(screen.getByTestId("cleanup-protections-impact")).toHaveTextContent("With this change: Too many previews. Wait a minute.")

    jest.mocked(previewCleanupProtectionImpact).mockRejectedValueOnce(new Error("offline"))
    await user.click(screen.getByTestId("cleanup-protections-g8-enabled"))
    await settle()
    expect(screen.getByTestId("cleanup-protections-impact")).toHaveTextContent(IMPACT_FAILED)

    await user.click(screen.getByTestId("cleanup-protections-g13-enabled"))
    await user.click(screen.getByTestId("cleanup-protections-g13-collections"))
    await user.click(await screen.findByTestId("cleanup-protections-g13-collections-option-staff-picks"))
    await settle()
    expect(screen.getByTestId("cleanup-protections-impact")).toHaveTextContent("A new Plex collection counts after the next library read.")
  })
})
