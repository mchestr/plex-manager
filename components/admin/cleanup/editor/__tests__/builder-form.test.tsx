import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useReducer, useState } from "react"

import { BuilderForm, type BuilderFormProps } from "@/components/admin/cleanup/editor/builder-form"
import { buildPreview, TAKEN_AT } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { draftReducer, initDraftState } from "@/lib/cleanup/editor/draft"
import type { EditorError } from "@/lib/cleanup/editor/errors"
import type { FocusTarget } from "@/lib/cleanup/editor/focus"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

// Invented rule and library data.
const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [
    { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
    { id: "c2", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } },
    {
      id: "a1",
      kind: "anyOf",
      conditions: [
        { id: "c3", field: "request.exists", op: "is", value: { exists: false } },
        { id: "c4", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } },
      ],
    },
  ],
  protections: [{ id: "p1", field: "watch.plays", op: "atLeast", value: { count: 3, window: { kind: "total" } } }],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}

function editorData(overrides: Partial<CleanupEditorData["rule"]> = {}): CleanupEditorData {
  return {
    rule: { id: "rule-1", name: "Old films", mode: "dryRun", revision: 3, definition: DRAFT, turnedOnAt: null, lastDryRun: null, ...overrides },
    fields: [],
    libraries: [
      { sectionId: "1", title: "Films", level: "movie", arr: "radarr", disabledReason: null },
      { sectionId: "2", title: "Films 4K", level: "movie", arr: null, disabledReason: "Radarr has no root folder for this library." },
      { sectionId: "3", title: "Series", level: "show", arr: "sonarr", disabledReason: null },
    ],
    globalProtections: [
      { id: "g1", sentence: "Kept by a member, until the Keep ends", enabled: true, appliesToLevel: true },
      { id: "g4", sentence: "Played by anyone in the last 30 days", enabled: true, appliesToLevel: true },
      { id: "g11", sentence: "Season rules: the newest season of a continuing show", enabled: true, appliesToLevel: false },
    ],
    requesterOptions: [{ userId: "u1", name: "Robin Vale", status: "member", requests: 4 }],
    options: { automaticMinGraceDays: 7, defaults: { graceDays: 30, importListExclusion: true } },
    importListCount: { movie: 169, show: 0 },
    zone: "UTC",
    initialPreview: buildPreview(),
  }
}

const PREVIEW = buildPreview({
  clauses: [
    { id: "c1", passAlone: 640, heldBack: 22 },
    { id: "c2", passAlone: 478, heldBack: 13 },
    { id: "a1", passAlone: 560, heldBack: 6 },
  ],
  protectedBy: [
    { protectionId: "g4", count: 12 },
    { protectionId: "p1", count: 7 },
  ],
})

type HarnessProps = Partial<Omit<BuilderFormProps, "draft" | "dispatch">> & { start?: RuleDraft }

const spies = { onEditingChange: jest.fn(), onOpenRecipe: jest.fn() }

let setPreview: (preview: PreviewResponse, updating?: boolean) => void = () => {}
let request: (target: FocusTarget) => void = () => {}
let setErrors: (errors: EditorError[]) => void = () => {}

function Harness({ start = DRAFT, ...props }: HarnessProps) {
  const [state, dispatch] = useReducer(draftReducer, initDraftState(start, "Old films"))
  const [preview, setLocal] = useState<{ data: PreviewResponse; updating: boolean }>({ data: PREVIEW, updating: false })
  const [focusRequest, setFocusRequest] = useState<FocusTarget | null>(null)
  const [errors, setLocalErrors] = useState<EditorError[]>([])
  setPreview = (data, updating = false) => setLocal({ data, updating })
  request = (target) => setFocusRequest({ ...target })
  setErrors = setLocalErrors
  return (
    <BuilderForm
      draft={state}
      dispatch={dispatch}
      editorData={editorData()}
      preview={preview.data}
      updating={preview.updating}
      mode="dryRun"
      isLive={false}
      errors={errors}
      focusRequest={focusRequest}
      {...spies}
      {...props}
    />
  )
}

function wide(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

const original = window.matchMedia
beforeEach(() => {
  wide(true)
  Object.values(spies).forEach((spy) => spy.mockClear())
})
afterEach(() => {
  window.matchMedia = original
})

const tid = (id: string) => screen.getByTestId(id)
const editor = () => screen.queryByTestId("admin-cleanup-condition-editor")
const editRegion = () => document.querySelector<HTMLElement>('[data-slot="edit-region"]')

/**
 * Picks a target of the group-with submenu by keyboard, as a pointer pick
 * races Base UI's guard against a release on an item that just opened.
 */
async function pickGroupTarget(user: ReturnType<typeof userEvent.setup>, triggerId: string, index: number) {
  act(() => screen.getByTestId(triggerId).focus())
  await user.keyboard("{Enter}")
  await screen.findByTestId(`${triggerId}-duplicate`)
  await user.keyboard("{ArrowDown}{ArrowRight}")
  await screen.findByText("Group with")
  await user.keyboard(`${"{ArrowDown}".repeat(index)}{Enter}`)
}

function setup(props: HarnessProps = {}) {
  const user = userEvent.setup()
  const view = render(<Harness {...props} />)
  return { user, ...view }
}

describe("BuilderForm", () => {
  it("renders one form with the four parts in order, and In plain words after it", async () => {
    const { container } = setup()
    const form = tid("admin-cleanup-rule-form")
    expect(form.tagName).toBe("FORM")
    expect(form).toHaveAccessibleName("Rule")
    const legends = Array.from(form.querySelectorAll('[data-slot="fieldset-legend"]')).map((legend) => legend.textContent)
    expect(legends).toEqual(["Clean up", "Find movies where all of these are true", "Never touch", "Then"])
    const words = tid("admin-cleanup-plain-words")
    expect(words).toHaveTextContent(
      "Movies in the Films library that were added more than 365 days ago, had no play in the last 365 days, and either have no request in Overseerr or were requested only by former members."
    )
    expect(within(words).getByText("Films").tagName).toBe("STRONG")
    expect(words).toHaveTextContent("This rule is in Dry run, so runs only record its matches.")
    expect(form.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Both layouts stay in the DOM, so every test id is unique, hidden copies included (UX 10.1 item 7)
    const ids = Array.from(document.querySelectorAll("[data-testid]"), (el) => el.getAttribute("data-testid"))
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    expect(await axe(container)).toHaveNoViolations()
  })

  it("numbers the condition rows and shows held-back and keeps-safe text from the preview", () => {
    setup()
    expect(tid("admin-cleanup-condition-c2")).toHaveAccessibleName("Condition 2 of 4: Last played more than 365 days ago, or never.")
    expect(tid("admin-cleanup-condition-c3")).toHaveAccessibleName("Condition 3 of 4 in the any-of group: Requested in Overseerr: no.")
    expect(tid("admin-cleanup-condition-c1-held")).toHaveTextContent("22 more without it")
    expect(tid("admin-cleanup-group-a1-held")).toHaveTextContent("6 more without it")
    expect(tid("admin-cleanup-protection-p1-held")).toHaveTextContent("keeps 7 safe")
    // The global line counts the items that a global protection keeps (12), not every protected item (17)
    expect(tid("admin-cleanup-global-protections")).toHaveTextContent("Always on: 2 global protections keep 12 movies safe.")
  })

  it("adds a condition: a complete row, the editor on it with the field search, and the message after it closes", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-add-condition"))
    expect(tid("admin-cleanup-condition-c5")).toHaveAccessibleName("Condition 5 of 5: Added more than 90 days ago.")
    await waitFor(() => expect(editor()).not.toBeNull())
    expect(screen.getByTestId("admin-cleanup-condition-editor-field-search")).toHaveFocus()
    expect(spies.onEditingChange).toHaveBeenLastCalledWith("c5")
    // Nothing speaks while the editor is open
    act(() => setPreview(buildPreview({ matches: 191, bytes: String(Math.round(1.2 * 1024 ** 4)) })))
    expect(editRegion()).toHaveTextContent("")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(editor()).toBeNull())
    expect(spies.onEditingChange).toHaveBeenLastCalledWith(null)
    await waitFor(() => expect(tid("admin-cleanup-condition-c5-field")).toHaveFocus())
    expect(tid("admin-cleanup-condition-c5")).toBeInTheDocument()
    expect(editRegion()).toHaveTextContent("Condition added. 5 conditions. 191 matches, 1.2 terabytes.")
  })

  it("opens the editor at the pressed part, restores the value on Esc and applies Done", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-condition-c2-value"))
    await waitFor(() => expect(editor()).not.toBeNull())
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAttribute("data-state", "open")
    await user.click(screen.getByTestId("admin-cleanup-condition-editor-preset-2-years"))
    expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("2 years")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(editor()).toBeNull())
    expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("365 days")
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-value")).toHaveFocus())

    await user.keyboard("{Enter}")
    await waitFor(() => expect(editor()).not.toBeNull())
    await user.click(screen.getByTestId("admin-cleanup-condition-editor-preset-180-days"))
    await user.click(screen.getByTestId("admin-cleanup-condition-editor-done"))
    await waitFor(() => expect(editor()).toBeNull())
    expect(tid("admin-cleanup-condition-c2-value")).toHaveTextContent("180 days")
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAttribute("data-state", "changed")
  })

  it("removes a row with Undo, moves focus, speaks after the preview settles, and Undo puts it back", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-condition-c1-remove"))
    expect(screen.queryByTestId("admin-cleanup-condition-c1")).toBeNull()
    expect(tid("admin-cleanup-undo-c1")).toHaveTextContent("Condition removed: Added more than 365 days ago.")
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-field")).toHaveFocus())
    act(() => setPreview(buildPreview({ matches: 210 }), true))
    expect(editRegion()).toHaveTextContent("")
    act(() => setPreview(buildPreview({ matches: 204 })))
    expect(editRegion()).toHaveTextContent("Condition removed. 3 conditions. 204 matches.")

    await user.click(tid("admin-cleanup-undo-c1-button"))
    expect(screen.queryByTestId("admin-cleanup-undo-c1")).toBeNull()
    await waitFor(() => expect(tid("admin-cleanup-condition-c1-field")).toHaveFocus())
    act(() => setPreview(buildPreview({ matches: 197 })))
    expect(editRegion()).toHaveTextContent("Condition restored. 4 conditions. 197 matches.")
  })

  it("keeps the Undo line until the next edit, and has no timer", async () => {
    jest.useFakeTimers()
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<Harness />)
      await user.click(tid("admin-cleanup-protection-p1-remove"))
      expect(tid("admin-cleanup-undo-p1")).toBeInTheDocument()
      await waitFor(() => expect(tid("admin-cleanup-add-protection")).toHaveFocus())
      act(() => jest.advanceTimersByTime(10 * 60 * 1000))
      expect(tid("admin-cleanup-undo-p1")).toBeInTheDocument()
      await user.click(tid("admin-cleanup-add-group"))
      expect(screen.queryByTestId("admin-cleanup-undo-p1")).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it("adds an any-of group with focus on its first token", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-add-group"))
    const group = tid("admin-cleanup-group-a2")
    expect(group).toHaveAccessibleName("Any of these, 2 conditions. One of them must be true.")
    await waitFor(() => expect(tid("admin-cleanup-condition-c5-field")).toHaveFocus())
    expect(within(group).getByTestId("admin-cleanup-condition-c5")).toHaveAccessibleName(/Requested in Overseerr: no/)
  })

  it("moves focus after row menu items: group with, move out, ungroup, protection and back", async () => {
    // Base UI turns pointer events off on a submenu while it opens
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Harness />)
    await pickGroupTarget(user, "admin-cleanup-condition-c1-menu", 0)
    expect(within(tid("admin-cleanup-group-a2")).getByTestId("admin-cleanup-condition-c2")).toBeInTheDocument()
    await waitFor(() => expect(tid("admin-cleanup-condition-c1-field")).toHaveFocus())

    await user.click(tid("admin-cleanup-condition-c1-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-condition-c1-menu-ungroup"))
    expect(within(tid("admin-cleanup-group-a2")).queryByTestId("admin-cleanup-condition-c1")).toBeNull()
    await waitFor(() => expect(tid("admin-cleanup-condition-c1-field")).toHaveFocus())

    await user.click(tid("admin-cleanup-group-a1-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-group-a1-menu-ungroup"))
    expect(screen.queryByTestId("admin-cleanup-group-a1")).toBeNull()
    await waitFor(() => expect(tid("admin-cleanup-condition-c3-field")).toHaveFocus())

    await user.click(tid("admin-cleanup-condition-c3-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-condition-c3-menu-protection"))
    expect(screen.queryByTestId("admin-cleanup-condition-c3")).toBeNull()
    await waitFor(() => expect(tid("admin-cleanup-protection-p2-field")).toHaveFocus())

    await user.click(tid("admin-cleanup-protection-p2-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-protection-p2-menu-condition"))
    await waitFor(() => expect(tid("admin-cleanup-condition-c5-field")).toHaveFocus())
    expect(tid("admin-cleanup-condition-c5")).toHaveAccessibleName(/Requested in Overseerr: no/)
  })

  it("on a phone, Duplicate in the condition Sheet's menu puts focus on the copy's box (UX 7.9, UX review UX-06)", async () => {
    wide(false)
    // A phone shows the boxes and hides the desktop rows (`hidden md:flex`)
    Object.defineProperty(HTMLElement.prototype, "checkVisibility", { configurable: true, value: function (this: HTMLElement) {
      return this.closest(".hidden") === null
    } })
    try {
      const { user } = setup()
      await user.click(tid("admin-cleanup-condition-c2-box"))
      await waitFor(() => expect(editor()).not.toBeNull())
      await user.click(tid("admin-cleanup-condition-editor-menu"))
      await user.click(await screen.findByTestId("admin-cleanup-condition-editor-menu-duplicate"))
      await waitFor(() => expect(editor()).toBeNull())
      await waitFor(() => expect(tid("admin-cleanup-condition-c5-box")).toHaveFocus())
    } finally {
      delete (HTMLElement.prototype as { checkVisibility?: unknown }).checkVisibility
    }
  })

  it("duplicates a row after itself and speaks it as added", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-condition-c2-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-condition-c2-menu-duplicate"))
    await waitFor(() => expect(tid("admin-cleanup-condition-c5-field")).toHaveFocus())
    act(() => setPreview(buildPreview({ matches: 197 })))
    expect(editRegion()).toHaveTextContent("Condition added. 5 conditions. 197 matches, 1.3 terabytes.")
  })

  it("shows the error summary, focuses it on request, and a link opens the token's editor", async () => {
    const { user } = setup()
    act(() =>
      setErrors([
        { key: "c2", code: "too_small", label: "Last played", message: "Enter a whole number of days from 1 to 3650." },
        { key: "then.graceDays", code: "too_small", label: "Then", message: "Enter a whole number of days from 1 to 3650." },
      ])
    )
    act(() => request({ kind: "summary" }))
    const summary = tid("admin-cleanup-error-summary")
    await waitFor(() => expect(summary).toHaveFocus())
    expect(summary).toHaveTextContent("Fix 2 things before you save")
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAttribute("data-state", "error")
    expect(tid("admin-cleanup-condition-c2-error")).toHaveTextContent("Enter a whole number of days from 1 to 3650.")
    await user.click(tid("admin-cleanup-error-link-c2"))
    await waitFor(() => expect(editor()).not.toBeNull())
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-condition-editor-number")).toHaveFocus())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(editor()).toBeNull())

    await user.click(tid("admin-cleanup-error-link-then-grace-days"))
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-then-grace-chips")).toBeInTheDocument())
  })

  it("follows a focus request to a token, and to the editor of a condition", async () => {
    setup()
    act(() => request({ kind: "token", id: "c1", part: "value" }))
    await waitFor(() => expect(tid("admin-cleanup-condition-c1-value")).toHaveFocus())
    act(() => request({ kind: "editor", id: "c2", part: "operator" }))
    await waitFor(() => expect(editor()).not.toBeNull())
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-condition-editor-operator-more-than")).toHaveFocus())
    act(() => request({ kind: "control", name: "libraries" }))
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-scope-library-1")).toBeInTheDocument())
  })

  it("passes the settled count to the open editor footer, never an updating one", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-condition-c1-value"))
    await waitFor(() => expect(editor()).not.toBeNull())
    expect(screen.getByTestId("admin-cleanup-condition-editor-count")).toHaveTextContent("With this value: 197 matches")
    act(() => setPreview(buildPreview({ matches: 150 }), true))
    expect(screen.getByTestId("admin-cleanup-condition-editor-count")).toHaveTextContent("With this value: 197 matches")
    act(() => setPreview(buildPreview({ matches: 150 })))
    expect(screen.getByTestId("admin-cleanup-condition-editor-count")).toHaveTextContent("With this value: 150 matches")
  })

  it("changes the level: conditions that do not apply are marked and listed", async () => {
    const { user } = setup({
      start: { ...DRAFT, level: "show", libraries: ["3"], conditions: [...DRAFT.conditions, { id: "c5", field: "show.status", op: "is", value: { status: "ended" } }] },
    })
    await user.click(tid("admin-cleanup-scope-level"))
    await user.click(await screen.findByTestId("admin-cleanup-scope-level-movie"))
    expect(tid("admin-cleanup-scope-level")).toHaveTextContent("Movies")
    expect(tid("admin-cleanup-scope-libraries")).toHaveTextContent("Films")
    expect(tid("admin-cleanup-condition-c5-field")).toHaveAttribute("data-state", "notApplicable")
    expect(tid("admin-cleanup-condition-c5-error")).toHaveTextContent("Show status does not apply to movies. Remove it, or change the level back.")
    expect(screen.getByText("You changed the level to Movies")).toBeInTheDocument()
    expect(screen.getByText(/1 condition does not apply to movies: Show status: ended\./)).toBeInTheDocument()
  })

  it("shows a failed source on the field token and in the row notice", () => {
    render(<Harness preview={buildPreview({ sources: [{ service: "tautulli", state: "failed", readAt: null }] })} />)
    expect(tid("admin-cleanup-condition-c2-field")).toHaveAttribute("data-state", "sourceFailed")
    expect(tid("admin-cleanup-condition-c2-field")).toHaveAccessibleName("Last played, field, Tautulli failed. Change.")
    expect(tid("admin-cleanup-condition-c2-error")).toHaveTextContent(`Tautulli did not answer at 3:07 AM`)
    expect(TAKEN_AT).toContain("03:07")
  })

  it("changes the Then part and the libraries through the draft", async () => {
    const { user } = setup()
    await user.click(tid("admin-cleanup-then-grace"))
    await user.click(await screen.findByTestId("admin-cleanup-then-grace-chips-option-60"))
    expect(tid("admin-cleanup-then-grace")).toHaveTextContent("60 days")
    expect(tid("admin-cleanup-plain-words")).toHaveTextContent("Keep matches in Leaving soon for 60 days")
    await user.keyboard("{Escape}")
    await user.click(tid("admin-cleanup-scope-libraries"))
    expect(await screen.findByTestId("admin-cleanup-scope-library-2")).toHaveAttribute("data-disabled")
    await user.click(screen.getByTestId("admin-cleanup-scope-library-1"))
    expect(tid("admin-cleanup-scope-libraries")).toHaveTextContent("Choose a library")
  })
})
