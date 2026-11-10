/**
 * The rule editor root (UX 4.3, 7, TS 12.6 editor item 1): one draft and one
 * preview around the header, the builder, the preview card, Results, the
 * count bar, the Why Sheet and the impact dialog. Add, remove with Undo,
 * groups, protections, the level block, the error summary, focus moves, the
 * live text, Try and Ctrl S; the revision and mode of a live rule through
 * the menu, saves and newer server renders (E25, E34); discard, the busy
 * toast, the impact step, create and the leave guard.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Activity } from "react"

import { leaveIsGuarded } from "@/__tests__/helpers/leave-guard"
import { createCleanupRule, moveCleanupRuleToDryRun, saveCleanupRule, setCleanupRuleReviewFirst } from "@/actions/admin/cleanup-rules"
import { excludeCleanupItems } from "@/actions/admin/cleanup-items"
import { getCleanupItemWhy } from "@/actions/admin/cleanup-preview"
import { refreshCleanupData } from "@/actions/admin/cleanup-settings"
import { RuleEditor } from "@/components/admin/cleanup/editor/rule-editor"
import { EDITOR_TOASTS } from "@/components/admin/cleanup/editor/use-rule-state"
import { buildPreview, buildRef, buildWhy } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { LARGEST_MATCHES_HEADING_ID } from "@/components/admin/cleanup/preview/largest-matches"
import type { PreviewImpact, PreviewResponse } from "@/lib/cleanup/types/preview"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

const push = jest.fn()
const toast = { showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn(), showToast: jest.fn(), toast: jest.fn() }
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn() }) }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => toast }))
jest.mock("@/actions/admin/cleanup-rules", () => ({
  createCleanupRule: jest.fn(),
  saveCleanupRule: jest.fn(),
  duplicateCleanupRule: jest.fn(),
  runCleanupRuleDryRun: jest.fn(),
  deleteCleanupRule: jest.fn(),
  moveCleanupRuleToDryRun: jest.fn(),
  setCleanupRuleReviewFirst: jest.fn(),
  createCleanupRuleFromRecipe: jest.fn(),
}))
jest.mock("@/actions/admin/cleanup-settings", () => ({ refreshCleanupData: jest.fn(), startCleanupFirstRead: jest.fn() }))
jest.mock("@/actions/admin/cleanup-items", () => ({ excludeCleanupItems: jest.fn(), postponeCleanupItems: jest.fn() }))
jest.mock("@/actions/admin/cleanup-preview", () => ({ getCleanupItemWhy: jest.fn(), previewCleanupRecipe: jest.fn() }))

const save = saveCleanupRule as unknown as jest.Mock
const create = createCleanupRule as unknown as jest.Mock

// Invented rule and library data.
const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [
    { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
    { id: "c2", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } },
  ],
  protections: [{ id: "p1", field: "watch.plays", op: "atLeast", value: { count: 3, window: { kind: "total" } } }],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}

/** The Why of the first row, with a whole number of bytes. */
const why = (overrides: Parameters<typeof buildWhy>[0] = {}) => buildWhy({ item: buildRef({ sizeBytes: String(22 * 1024 ** 3) }), ...overrides })

const PREVIEW = buildPreview({ clauses: [{ id: "c1", passAlone: 640, heldBack: 22 }, { id: "c2", passAlone: 478, heldBack: 13 }] })

function editorData(rule: Partial<CleanupEditorData["rule"]> = {}, overrides: Partial<CleanupEditorData> = {}): CleanupEditorData {
  return {
    rule: { id: "rule-1", name: "Old films", mode: "dryRun", revision: 3, definition: DRAFT, turnedOnAt: null, lastDryRun: null, ...rule },
    fields: [],
    libraries: [
      { sectionId: "1", title: "Films", level: "movie", arr: "radarr", disabledReason: null },
      { sectionId: "3", title: "Series", level: "show", arr: "sonarr", disabledReason: null },
    ],
    globalProtections: [{ id: "g4", sentence: "Played by anyone in the last 30 days", enabled: true, appliesToLevel: true }],
    requesterOptions: [],
    options: { automaticMinGraceDays: 7, defaults: { graceDays: 30, importListExclusion: true } },
    importListCount: { movie: 12, show: 0 },
    zone: "UTC",
    initialPreview: PREVIEW,
    ...overrides,
  }
}

const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
const reply = (data: PreviewResponse) => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => data })
let nextPreview: PreviewResponse = PREVIEW

function wide(matches: boolean) {
  window.matchMedia = ((query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
}
const original = window.matchMedia

beforeEach(() => {
  jest.resetAllMocks()
  wide(true)
  nextPreview = PREVIEW
  fetchMock.mockImplementation(async () => reply(nextPreview))
  global.fetch = fetchMock as unknown as typeof fetch
  save.mockResolvedValue({ success: true, data: { revision: 4, exitsApplied: true, released: 0 } })
})
afterEach(() => {
  window.matchMedia = original
})

function setup(data: CleanupEditorData = editorData(), { redis = true } = {}) {
  // The render clock: the server's preview stays fresh for 30 s after it
  const now = Date.now()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (next: CleanupEditorData, mode: "visible" | "hidden" = "visible") => (
    <QueryClientProvider client={client}>
      <Activity mode={mode}>
        <RuleEditor data={next} now={now} redis={redis} />
      </Activity>
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  const view = render(ui(data))
  return { user, show: (next: CleanupEditorData, mode?: "visible" | "hidden") => view.rerender(ui(next, mode)), ...view }
}

const tid = (id: string) => screen.getByTestId(id)
const maybe = (id: string) => screen.queryByTestId(id)
const editor = () => maybe("admin-cleanup-condition-editor")
const editRegion = () => document.querySelector<HTMLElement>('[data-slot="edit-region"]')
const lastSave = () => save.mock.calls.at(-1)?.[0]

/** Changes condition c2 to 2 years through its editor. */
async function changeCondition(user: ReturnType<typeof userEvent.setup>) {
  await user.click(tid("admin-cleanup-condition-c2-value"))
  await waitFor(() => expect(editor()).not.toBeNull())
  await user.click(tid("admin-cleanup-condition-editor-preset-2-years"))
  await user.click(tid("admin-cleanup-condition-editor-done"))
  await waitFor(() => expect(editor()).toBeNull())
  expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("2 years")
}

async function chooseLevel(user: ReturnType<typeof userEvent.setup>, level: string) {
  await user.click(tid("admin-cleanup-scope-level"))
  await user.click(await screen.findByTestId(`admin-cleanup-scope-level-${level}`))
}

describe("RuleEditor", () => {
  it("lays out the page around the server's preview, with no request at mount and unique test ids", async () => {
    setup()
    const page = tid("admin-cleanup-editor-page")
    for (const id of ["admin-cleanup-editor-header", "admin-cleanup-rule-form", "admin-cleanup-preview", "admin-cleanup-results", "admin-cleanup-count-bar"]) {
      expect(within(page).getByTestId(id)).toBeInTheDocument()
    }
    expect(tid("admin-cleanup-preview-count")).toHaveTextContent("197")
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    const ids = Array.from(document.querySelectorAll("[data-testid]"), (el) => el.getAttribute("data-testid"))
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    expect(maybe("admin-cleanup-editor-unsaved")).toBeNull()
  })

  it("adds a condition, asks for its count at once, and speaks the settled count with the delta", async () => {
    const { user } = setup()
    nextPreview = buildPreview({ matches: 191, bytes: String(Math.round(1.2 * 1024 ** 4)) })
    await user.click(tid("admin-cleanup-add-condition"))
    expect(tid("admin-cleanup-condition-c3")).toBeInTheDocument()
    await waitFor(() => expect(editor()).not.toBeNull())
    // The open editor asks for its own counts: the request names its condition
    await waitFor(() => expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body))).toMatchObject({ focus: { conditionId: "c3" } }))
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body))
    expect(body).toMatchObject({ ruleId: "rule-1", tab: "matches" })
    expect(body.definition.conditions).toHaveLength(3)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(editor()).toBeNull())
    await waitFor(() => expect(editRegion()).toHaveTextContent("Condition added. 3 conditions. 191 matches, 1.2 terabytes."))
    expect(tid("admin-cleanup-preview-delta")).toHaveTextContent("6 fewer than before your last change")
    expect(tid("admin-cleanup-editor-unsaved")).toBeInTheDocument()
  })

  it("removes a row with Undo, and Undo puts it back with focus on it", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-condition-c1-remove"))
    expect(maybe("admin-cleanup-condition-c1")).toBeNull()
    expect(tid("admin-cleanup-undo-c1")).toHaveTextContent("Condition removed: Added more than 365 days ago.")
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-field")).toHaveFocus())
    await user.click(tid("admin-cleanup-undo-c1-button"))
    await waitFor(() => expect(tid("admin-cleanup-condition-c1-field")).toHaveFocus())
    expect(maybe("admin-cleanup-undo-c1")).toBeNull()
  })

  it("adds an any-of group and a rule protection", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-add-group"))
    expect(tid("admin-cleanup-group-a1")).toHaveAccessibleName("Any of these, 2 conditions. One of them must be true.")
    await waitFor(() => expect(tid("admin-cleanup-condition-c3-field")).toHaveFocus())
    await user.click(tid("admin-cleanup-add-protection"))
    expect(tid("admin-cleanup-protection-p2")).toBeInTheDocument()
    await waitFor(() => expect(editor()).not.toBeNull())
  })

  it("blocks Save on a level change with the error summary, and a link opens the token's editor", async () => {
    const show: RuleDraft = { ...DRAFT, level: "show", libraries: ["3"], then: { ...DRAFT.then, action: "show.delete" },
      conditions: [...DRAFT.conditions, { id: "c3", field: "show.status", op: "is", value: { status: "ended" } }] }
    const { user } = setup(editorData({ definition: show }))
    await chooseLevel(user, "movie")
    expect(screen.getByText("You changed the level to Movies")).toBeInTheDocument()
    await user.click(tid("admin-cleanup-editor-save"))
    const summary = tid("admin-cleanup-error-summary")
    expect(summary).toHaveTextContent("Fix 1 thing before you save")
    await waitFor(() => expect(summary).toHaveFocus())
    expect(save).not.toHaveBeenCalled()
    await user.click(within(summary).getByRole("button"))
    await waitFor(() => expect(editor()).not.toBeNull())
    // Removing the condition fixes it: the summary goes before the next Save
    await user.keyboard("{Escape}")
    await user.click(tid("admin-cleanup-condition-c3-remove"))
    await waitFor(() => expect(maybe("admin-cleanup-error-summary")).toBeNull())
  })

  it("Try from the Why Sheet changes the draft value and moves focus to the token", async () => {
    ;(getCleanupItemWhy as jest.Mock).mockResolvedValue({
      success: true,
      data: why({ state: "nearMiss", conditions: [{ id: "c2", label: "Last played", verdict: "fail", value: [{ text: "played Dec 21, 2025" }], threshold: "more than 365 days", sources: [] }],
        tryValue: { conditionId: "c2", value: { duration: { amount: 10, unit: "months" }, orNever: true }, label: "more than 10 months", addsCount: 22, addsBytes: String(131 * 1024 ** 3) } }),
    })
    const { user } = setup()
    await user.click(tid("admin-cleanup-results-row-movie-1001-why"))
    await user.click(await screen.findByTestId("admin-cleanup-why-try"))
    await waitFor(() => expect(maybe("admin-cleanup-why")).toBeNull())
    expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("10 months")
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-value")).toHaveFocus())
    expect(getCleanupItemWhy).toHaveBeenCalledWith(expect.objectContaining({ itemKey: "movie-1001", ruleId: "rule-1", definition: DRAFT }))
  })

  it("after an exclusion from the Why Sheet, loads the preview again and focuses Results when the row went", async () => {
    ;(getCleanupItemWhy as jest.Mock).mockResolvedValue({ success: true, data: why({ state: "match" }) })
    ;(excludeCleanupItems as jest.Mock).mockResolvedValue({ success: true, data: { excluded: 1, rescued: 0, skipped: 0 } })
    const { user } = setup()
    await user.click(tid("admin-cleanup-results-row-movie-1001-why"))
    await user.click(await screen.findByTestId("admin-cleanup-why-exclude"))
    nextPreview = buildPreview({ rows: [], largest: [], tabs: { ...PREVIEW.tabs, matches: 196 } })
    await user.click(await screen.findByTestId("admin-cleanup-exclude-confirm"))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(maybe("admin-cleanup-results-row-movie-1001-why")).toBeNull())
    await waitFor(() => expect(document.getElementById("admin-cleanup-results-heading")).toHaveFocus())
  })

  it("after an exclusion from a Largest matches Why, focuses the Largest matches heading when the row went", async () => {
    ;(getCleanupItemWhy as jest.Mock).mockResolvedValue({ success: true, data: why({ state: "match" }) })
    ;(excludeCleanupItems as jest.Mock).mockResolvedValue({ success: true, data: { excluded: 1, rescued: 0, skipped: 0 } })
    const { user } = setup()
    await user.click(tid("admin-cleanup-preview-largest-movie-1001-why"))
    await user.click(await screen.findByTestId("admin-cleanup-why-exclude"))
    nextPreview = buildPreview({ largest: PREVIEW.largest.slice(1), tabs: { ...PREVIEW.tabs, matches: 196 } })
    await user.click(await screen.findByTestId("admin-cleanup-exclude-confirm"))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(maybe("admin-cleanup-preview-largest-movie-1001-why")).toBeNull())
    await waitFor(() => expect(document.getElementById(LARGEST_MATCHES_HEADING_ID)).toHaveFocus())
  })

  it("saves with Ctrl S and Cmd S only while the page shows", async () => {
    const { user, show } = setup()
    await user.keyboard("{Control>}s{/Control}")
    expect(save).not.toHaveBeenCalled()
    await changeCondition(user)
    await user.keyboard("{Control>}s{/Control}")
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(lastSave()).toMatchObject({ ruleId: "rule-1", name: "Old films", expectedRevision: 3, confirmImpact: false })
    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith(EDITOR_TOASTS.saved))
    await waitFor(() => expect(maybe("admin-cleanup-editor-unsaved")).toBeNull())

    await user.click(tid("admin-cleanup-condition-c1-remove"))
    show(editorData(), "hidden")
    await user.keyboard("{Meta>}s{/Meta}")
    expect(save).toHaveBeenCalledTimes(1)
    show(editorData(), "visible")
    await user.keyboard("{Meta>}s{/Meta}")
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(lastSave()).toMatchObject({ expectedRevision: 4 })
  })

  it("on a live rule: change, Move back to Dry run, change the level, Save, then Save again", async () => {
    ;(moveCleanupRuleToDryRun as jest.Mock).mockResolvedValue({ success: true, data: { released: 2, revision: 5, mode: "dryRun" } })
    const { user } = setup(editorData({ mode: "reviewFirst", revision: 4 }))
    expect(tid("admin-cleanup-scope-level")).toHaveAttribute("data-state", "readOnly")
    await changeCondition(user)
    await user.click(tid("admin-cleanup-editor-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-editor-menu-dry-run-mode"))
    await user.click(await screen.findByTestId("admin-cleanup-dry-run-mode-confirm"))
    await waitFor(() => expect(tid("admin-cleanup-editor-mode")).toHaveTextContent("Dry run"))
    await waitFor(() => expect(tid("admin-cleanup-editor-menu")).toHaveFocus())
    // The draft stays, and the level token is editable at once
    expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("2 years")
    expect(tid("admin-cleanup-editor-turn-on")).toHaveTextContent("Save and turn on...")
    await chooseLevel(user, "show")
    expect(tid("admin-cleanup-scope-level")).toHaveTextContent("Whole shows")

    save.mockResolvedValueOnce({ success: true, data: { revision: 6, exitsApplied: true, released: 0 } })
    await user.click(tid("admin-cleanup-editor-save"))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(lastSave()).toMatchObject({ expectedRevision: 5, confirmImpact: false, definition: expect.objectContaining({ level: "show", libraries: ["3"] }) })
    await waitFor(() => expect(maybe("admin-cleanup-editor-unsaved")).toBeNull())

    await user.click(tid("admin-cleanup-condition-c1-remove"))
    await user.click(tid("admin-cleanup-editor-save"))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(lastSave()).toMatchObject({ expectedRevision: 6 })
  })

  it("follows a newer server render while clean: the badge, the level token and the sent revision", async () => {
    const { user, show } = setup(editorData({ mode: "dryRun", revision: 3 }))
    show(editorData({ mode: "automatic", revision: 7 }))
    expect(tid("admin-cleanup-editor-mode")).toHaveTextContent("Automatic")
    expect(tid("admin-cleanup-scope-level")).toHaveAttribute("data-state", "readOnly")
    nextPreview = buildPreview({ impact: { leave: 0, join: 0, keep: 4, joinLeaveOn: "2026-12-08", items: [], actionChange: 0 } })
    await changeCondition(user)
    await user.click(tid("admin-cleanup-editor-save"))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(lastSave()).toMatchObject({ expectedRevision: 7, confirmImpact: false })
  })

  it("keeps its own revision and mode while dirty, and the stale save shows the CONFLICT words", async () => {
    const { user, show } = setup(editorData({ mode: "dryRun", revision: 3 }))
    await changeCondition(user)
    show(editorData({ mode: "automatic", revision: 7 }))
    expect(tid("admin-cleanup-editor-mode")).toHaveTextContent("Dry run")
    expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("2 years")
    save.mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "Someone changed this rule. Reload it and try again." })
    await user.click(tid("admin-cleanup-editor-save"))
    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith("Someone changed this rule. Reload it and try again."))
    expect(lastSave()).toMatchObject({ expectedRevision: 3 })
    expect(tid("admin-cleanup-editor-unsaved")).toBeInTheDocument()
  })

  it("discards changes back to the saved rule", async () => {
    const { user } = setup()
    await changeCondition(user)
    await user.click(tid("admin-cleanup-editor-discard"))
    await user.click(await screen.findByTestId("admin-cleanup-editor-discard-dialog-confirm"))
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("365 days"))
    expect(toast.showSuccess).toHaveBeenCalledWith(EDITOR_TOASTS.discarded)
    expect(maybe("admin-cleanup-editor-unsaved")).toBeNull()
  })

  it("shows the busy toast when a run holds the exits", async () => {
    save.mockResolvedValueOnce({ success: true, data: { revision: 4, exitsApplied: false, released: 0 } })
    const { user } = setup()
    await changeCondition(user)
    await user.click(tid("admin-cleanup-editor-save"))
    await waitFor(() =>
      expect(toast.showSuccess).toHaveBeenCalledWith("Rule saved. A run is in progress. At its end, titles that no longer match leave Leaving soon.")
    )
  })

  it("asks through the impact dialog before a live save that moves titles", async () => {
    const impact: PreviewImpact = { leave: 4, join: 2, keep: 17, joinLeaveOn: "2026-12-08", items: [], actionChange: 0 }
    const { user } = setup(editorData({ mode: "reviewFirst", revision: 4 }))
    nextPreview = buildPreview({ impact })
    await changeCondition(user)
    await user.click(tid("admin-cleanup-editor-save"))
    const dialog = await screen.findByTestId("admin-cleanup-impact-dialog")
    expect(dialog).toHaveTextContent("Save changes to Old films?")
    expect(dialog).toHaveTextContent("4 movies leave Leaving soon: they no longer match.")
    expect(save).not.toHaveBeenCalled()
    await user.click(tid("admin-cleanup-impact-keep-editing"))
    await waitFor(() => expect(maybe("admin-cleanup-impact-dialog")).toBeNull())
    expect(save).not.toHaveBeenCalled()

    save.mockResolvedValueOnce({ success: true, data: { revision: 5, exitsApplied: true, released: 4 } })
    await user.click(tid("admin-cleanup-editor-save"))
    await user.click(await screen.findByTestId("admin-cleanup-impact-save"))
    await waitFor(() => expect(lastSave()).toMatchObject({ expectedRevision: 4, confirmImpact: true }))
    await waitFor(() => expect(maybe("admin-cleanup-impact-dialog")).toBeNull())
    expect(toast.showSuccess).toHaveBeenCalledWith(EDITOR_TOASTS.saved)
  })

  it("Save and turn on saves, then opens the turn-on page; a failed save stays with the summary", async () => {
    const { user } = setup()
    await changeCondition(user)
    save.mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "Check the rule.", fieldErrors: { libraries: ["Choose at least one library."] } })
    await user.click(tid("admin-cleanup-editor-turn-on"))
    await waitFor(() => expect(tid("admin-cleanup-error-summary")).toHaveTextContent("Clean up: choose at least one library."))
    expect(push).not.toHaveBeenCalled()
    await user.click(tid("admin-cleanup-editor-turn-on"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/cleanup/rules/rule-1/turn-on"))
  })

  it("Switch to Review first from the editor: the badge reads Review first, and focus goes back to More actions", async () => {
    ;(setCleanupRuleReviewFirst as jest.Mock).mockResolvedValue({ success: true, data: { revision: 5, mode: "reviewFirst" } })
    const { user } = setup(editorData({ mode: "automatic", revision: 4 }))
    await user.click(tid("admin-cleanup-editor-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-editor-menu-review-first"))
    await user.click(await screen.findByTestId("admin-cleanup-review-first-confirm"))
    await waitFor(() => expect(tid("admin-cleanup-editor-mode")).toHaveTextContent("Review first"))
    await waitFor(() => expect(tid("admin-cleanup-editor-menu")).toHaveFocus())
  })

  it("creates a new rule, resets the start draft, and the rule page focuses its title", async () => {
    create.mockResolvedValue({ success: true, data: { ruleId: "rule-9", dryRunQueued: true } })
    const start = editorData({ id: null, revision: null, name: "New rule" })
    const { user, unmount } = setup(start)
    expect(maybe("admin-cleanup-editor-menu")).toBeNull()
    await user.click(tid("admin-cleanup-condition-c1-remove"))
    await user.click(tid("admin-cleanup-editor-create"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/cleanup/rules/rule-9"))
    expect(create).toHaveBeenCalledWith({ name: "New rule", definition: expect.objectContaining({ conditions: [DRAFT.conditions[1]] }) })
    expect(toast.showSuccess).toHaveBeenCalledWith(EDITOR_TOASTS.created)
    expect(tid("admin-cleanup-condition-c1")).toBeInTheDocument()
    expect(maybe("admin-cleanup-undo-c1")).toBeNull()
    unmount()
    setup(editorData({ id: "rule-9", revision: 1, name: "New rule" }))
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "New rule" })).toHaveFocus())
  })

  it("asks the browser before a reload or a close only while the draft has changes", async () => {
    const { user } = setup()
    expect(leaveIsGuarded()).toBe(false)
    await changeCondition(user)
    expect(leaveIsGuarded()).toBe(true)
  })

  it("selects a Results tab from the preview card and moves focus to it", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-preview-tab-count-near-misses"))
    await waitFor(() => expect(tid("admin-cleanup-results-tab-near-misses")).toHaveFocus())
    await waitFor(() => expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body)).tab).toBe("nearMisses"))
    await user.click(tid("admin-cleanup-count-bar-results"))
    expect(document.getElementById("admin-cleanup-results-heading")).toHaveFocus()
  })

  it("refreshes the library data from the preview card, and only with the job queue", async () => {
    ;(refreshCleanupData as jest.Mock).mockResolvedValueOnce({ success: true, data: { queued: true } }).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A read is in progress." })
    const { user, unmount } = setup()
    await user.click(tid("admin-cleanup-preview-refresh"))
    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith("Library read started"))
    await user.click(tid("admin-cleanup-preview-refresh"))
    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith("A read is in progress."))
    unmount()
    setup(editorData(), { redis: false })
    expect(tid("admin-cleanup-preview-refresh")).toBeDisabled()
    expect(tid("admin-cleanup-editor-turn-on")).toHaveAttribute("aria-disabled", "true")
  })

  it("closes the Why Sheet as the router hides the page", async () => {
    ;(getCleanupItemWhy as jest.Mock).mockResolvedValue({ success: true, data: why() })
    const { user, show } = setup()
    await user.click(tid("admin-cleanup-results-row-movie-1001-why"))
    expect(await screen.findByTestId("admin-cleanup-why")).toBeInTheDocument()
    act(() => show(editorData(), "hidden"))
    act(() => show(editorData(), "visible"))
    await waitFor(() => expect(maybe("admin-cleanup-why")).toBeNull())
  })
})
