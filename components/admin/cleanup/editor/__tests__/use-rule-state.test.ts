/**
 * The editor's rule state (TS 12.6 editor items 1 and 8, E25, E34): the
 * draft follows a newer server render while clean and keeps its own revision
 * while dirty; equal and lower revisions change nothing; the menu, a save,
 * a discard and a create reset each set what they own. Also the save flow:
 * the checks before a save, the impact step of a live rule, the refusals and
 * the create.
 */

import { act, renderHook, waitFor } from "@testing-library/react"

import { createCleanupRule, saveCleanupRule } from "@/actions/admin/cleanup-rules"
import {
  EDITOR_TOASTS,
  focusTitleOnArrival,
  isDirty,
  type RuleSaveOptions,
  takeTitleFocus,
  useRuleSave,
  useRuleState,
} from "@/components/admin/cleanup/editor/use-rule-state"
import { buildPreview } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import type { PreviewImpact } from "@/lib/cleanup/types/preview"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

const push = jest.fn()
const toast = { showSuccess: jest.fn(), showError: jest.fn() }
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn() }) }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => toast }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ createCleanupRule: jest.fn(), saveCleanupRule: jest.fn() }))

const saveMock = saveCleanupRule as unknown as jest.Mock
const createMock = createCleanupRule as unknown as jest.Mock

// Invented rule data.
const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [{ id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } }],
  protections: [],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}
const NEWER: RuleDraft = { ...DRAFT, then: { ...DRAFT.then, graceDays: 45 } }

type Rule = CleanupEditorData["rule"]
const saved = (overrides: Partial<Rule> = {}): Rule => ({
  id: "rule-1", name: "Old films", mode: "reviewFirst", revision: 4, definition: DRAFT, turnedOnAt: null, lastDryRun: null, ...overrides,
})
const blank = (overrides: Partial<Rule> = {}): Rule => ({ ...saved(), id: null, revision: null, mode: "dryRun", name: "New rule", ...overrides })

const addRow = { type: "add", to: "conditions" } as const

beforeEach(() => {
  jest.resetAllMocks()
})

describe("useRuleState", () => {
  it("starts from the rule: clean, with its revision and mode", () => {
    const { result } = renderHook(() => useRuleState(saved()))
    expect(result.current.dirty).toBe(false)
    expect(result.current.saved).toEqual({ revision: 4, mode: "reviewFirst", name: "Old films", definition: DRAFT })
    expect(result.current.draft.draft).toBe(DRAFT)
  })

  it("is dirty after an edit and after a rename", () => {
    const { result } = renderHook(() => useRuleState(saved()))
    act(() => result.current.dispatch({ type: "rename", name: "Older films" }))
    expect(result.current.dirty).toBe(true)
    act(() => result.current.dispatch({ type: "rename", name: "Old films" }))
    expect(result.current.dirty).toBe(false)
    act(() => result.current.dispatch(addRow))
    expect(result.current.dirty).toBe(true)
  })

  it("compares the draft with keys in any order", () => {
    const reordered = { then: DRAFT.then, protections: [], conditions: DRAFT.conditions, libraries: ["1"], level: "movie", schemaVersion: 1 } as RuleDraft
    expect(isDirty({ name: "A", draft: reordered, next: { c: 1, p: 0, a: 0 }, undo: null }, { name: "A", definition: DRAFT })).toBe(false)
  })

  it("takes a newer server revision while clean: mode, name and definition, with no undo record", () => {
    const { result, rerender } = renderHook(({ rule }) => useRuleState(rule), { initialProps: { rule: saved() } })
    act(() => result.current.dispatch(addRow))
    act(() => result.current.dispatch({ type: "remove", id: "c2" }))
    // The draft is the saved rule again, with the undo record of the removal
    expect(result.current.dirty).toBe(false)
    expect(result.current.draft.undo).not.toBeNull()
    rerender({ rule: saved({ revision: 5, mode: "automatic", name: "Old films, on", definition: NEWER }) })
    expect(result.current.saved).toEqual({ revision: 5, mode: "automatic", name: "Old films, on", definition: NEWER })
    expect(result.current.draft.draft).toEqual(NEWER)
    expect(result.current.draft.name).toBe("Old films, on")
    expect(result.current.draft.undo).toBeNull()
    expect(result.current.dirty).toBe(false)
  })

  it("keeps its own revision and mode while dirty, so the next save gets CONFLICT", () => {
    const { result, rerender } = renderHook(({ rule }) => useRuleState(rule), { initialProps: { rule: saved() } })
    act(() => result.current.dispatch(addRow))
    const draft = result.current.draft.draft
    rerender({ rule: saved({ revision: 5, mode: "automatic", definition: NEWER }) })
    expect(result.current.saved.revision).toBe(4)
    expect(result.current.saved.mode).toBe("reviewFirst")
    expect(result.current.draft.draft).toBe(draft)
    expect(result.current.dirty).toBe(true)
  })

  it.each([
    ["an equal", 4],
    ["a lower", 3],
  ])("changes nothing on %s server revision", (_name, revision) => {
    const { result, rerender } = renderHook(({ rule }) => useRuleState(rule), { initialProps: { rule: saved() } })
    act(() => result.current.ruleChanged({ revision: 4, mode: "dryRun" }))
    rerender({ rule: saved({ revision, mode: "automatic", definition: NEWER }) })
    expect(result.current.saved.mode).toBe("dryRun")
    expect(result.current.draft.draft).toBe(DRAFT)
  })

  it("takes the menu's revision and mode and keeps the draft", () => {
    const { result } = renderHook(() => useRuleState(saved()))
    act(() => result.current.dispatch(addRow))
    const draft = result.current.draft
    act(() => result.current.ruleChanged({ revision: 5, mode: "dryRun" }))
    expect(result.current.saved).toMatchObject({ revision: 5, mode: "dryRun" })
    expect(result.current.draft).toBe(draft)
    expect(result.current.dirty).toBe(true)
  })

  it("after a save, takes the stored definition when the draft did not change meanwhile", () => {
    const { result } = renderHook(() => useRuleState(saved()))
    act(() => result.current.dispatch(addRow))
    const sent = result.current.draft.draft
    const stored = { ...sent, libraries: ["1"] }
    act(() => result.current.savedAs({ revision: 5, name: "Old films", definition: stored, sent }))
    expect(result.current.saved).toMatchObject({ revision: 5, definition: stored })
    expect(result.current.draft.draft).toBe(stored)
    expect(result.current.dirty).toBe(false)
  })

  it("after a save, keeps an edit made while the save ran", () => {
    const { result } = renderHook(() => useRuleState(saved()))
    act(() => result.current.dispatch(addRow))
    const sent = result.current.draft.draft
    act(() => result.current.dispatch(addRow))
    act(() => result.current.savedAs({ revision: 5, name: "Old films", definition: sent, sent }))
    expect(result.current.draft.draft.conditions).toHaveLength(3)
    expect(result.current.dirty).toBe(true)
  })

  it("discards: the draft goes back to the saved rule, with no undo record", () => {
    const { result } = renderHook(() => useRuleState(saved()))
    act(() => result.current.dispatch(addRow))
    act(() => result.current.dispatch({ type: "remove", id: "c2" }))
    expect(result.current.draft.undo).not.toBeNull()
    act(() => result.current.dispatch({ type: "rename", name: "Other" }))
    act(() => result.current.discard())
    expect(result.current.draft.draft).toEqual(DRAFT)
    expect(result.current.draft.name).toBe("Old films")
    expect(result.current.draft.undo).toBeNull()
    expect(result.current.dirty).toBe(false)
  })

  it("discards to a newer server render that came while the draft had changes", () => {
    const { result, rerender } = renderHook(({ rule }) => useRuleState(rule), { initialProps: { rule: saved() } })
    act(() => result.current.dispatch(addRow))
    rerender({ rule: saved({ revision: 6, mode: "automatic", definition: NEWER }) })
    expect(result.current.saved.revision).toBe(4)
    act(() => result.current.discard())
    expect(result.current.saved).toMatchObject({ revision: 6, mode: "automatic" })
    expect(result.current.draft.draft).toEqual(NEWER)
  })

  it("resets a new rule to its newest start draft after a create, with an empty undo record", () => {
    const { result, rerender } = renderHook(({ rule }) => useRuleState(rule), { initialProps: { rule: blank() } })
    act(() => result.current.dispatch(addRow))
    act(() => result.current.dispatch({ type: "remove", id: "c2" }))
    act(() => result.current.dispatch(addRow))
    rerender({ rule: blank({ definition: NEWER }) })
    // A new rule has no revision: a new start draft does not replace the draft
    expect(result.current.draft.draft.conditions).toHaveLength(2)
    act(() => result.current.resetToStart())
    expect(result.current.draft.draft).toEqual(NEWER)
    expect(result.current.draft.undo).toBeNull()
    expect(result.current.dirty).toBe(false)
  })
})

describe("the title focus after a create", () => {
  it("is taken once, by the rule it names", () => {
    focusTitleOnArrival("rule-9")
    expect(takeTitleFocus(null)).toBe(false)
    expect(takeTitleFocus("rule-1")).toBe(false)
    expect(takeTitleFocus("rule-9")).toBe(true)
    expect(takeTitleFocus("rule-9")).toBe(false)
  })
})

const IMPACT: PreviewImpact = { leave: 2, join: 1, keep: 4, joinLeaveOn: "2026-12-08", items: [], actionChange: 0 }

function renderSave(rule: Rule, options: Partial<Omit<RuleSaveOptions, "rule">> = {}) {
  const setErrors = jest.fn()
  const currentPreview = jest.fn().mockResolvedValue(buildPreview({ impact: IMPACT }))
  const hook = renderHook(() => {
    const state = useRuleState(rule)
    return { state, save: useRuleSave({ rule: state, ruleId: rule.id, currentPreview, setErrors, ...options }) }
  })
  return { ...hook, setErrors, currentPreview }
}

describe("useRuleSave", () => {
  it("does nothing for a clean saved rule", () => {
    const { result } = renderSave(saved({ mode: "dryRun" }))
    act(() => result.current.save.save("save"))
    expect(saveMock).not.toHaveBeenCalled()
  })

  it("shows the draft's problems and sends nothing", () => {
    const { result, setErrors } = renderSave(saved({ mode: "dryRun" }))
    act(() => result.current.state.dispatch({ type: "setThen", then: { graceDays: undefined } }))
    act(() => result.current.save.save("save"))
    expect(setErrors).toHaveBeenCalledWith([expect.objectContaining({ key: "then.graceDays" })], true)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it("saves a live rule with no moved title at once", async () => {
    saveMock.mockResolvedValue({ success: true, data: { revision: 5, exitsApplied: true, released: 0 } })
    const { result, currentPreview } = renderSave(saved())
    currentPreview.mockResolvedValue(buildPreview({ impact: { ...IMPACT, leave: 0, join: 0 } }))
    act(() => result.current.state.dispatch(addRow))
    act(() => result.current.save.save("turnOn"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/cleanup/rules/rule-1/turn-on"))
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "rule-1", expectedRevision: 4, confirmImpact: false }))
    expect(result.current.save.pending).toBeNull()
  })

  it("opens the impact step when the server refuses an unconfirmed save, and tells when the preview shows none", async () => {
    saveMock.mockResolvedValueOnce({ success: false, code: "CLEANUP_IMPACT_UNCONFIRMED", error: "Review the change first." })
    const { result, currentPreview } = renderSave(saved())
    currentPreview.mockResolvedValueOnce(buildPreview()).mockResolvedValueOnce(buildPreview({ impact: IMPACT }))
    act(() => result.current.state.dispatch(addRow))
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(result.current.save.pending?.impact).toEqual(IMPACT))

    act(() => result.current.save.cancelImpact())
    saveMock.mockResolvedValueOnce({ success: false, code: "CLEANUP_IMPACT_UNCONFIRMED", error: "Review the change first." })
    currentPreview.mockResolvedValueOnce(buildPreview()).mockResolvedValueOnce(buildPreview())
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith("That didn't work. Try again."))
    expect(result.current.save.pending).toBeNull()
  })

  it("says so when the impact cannot load", async () => {
    const { result, currentPreview } = renderSave(saved())
    currentPreview.mockRejectedValue(new Error("offline"))
    act(() => result.current.state.dispatch(addRow))
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith("That didn't work. Try again."))
    expect(saveMock).not.toHaveBeenCalled()
  })

  it("keeps a refusal of the confirmed save in the dialog, and server field errors in the summary", async () => {
    const { result, setErrors } = renderSave(saved())
    act(() => result.current.state.dispatch(addRow))
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(result.current.save.pending).not.toBeNull())
    saveMock.mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "Someone changed this rule. Reload it and try again." })
    act(() => result.current.save.confirmImpact())
    await waitFor(() => expect(result.current.save.pending?.error).toBe("Someone changed this rule. Reload it and try again."))
    expect(saveMock).toHaveBeenLastCalledWith(expect.objectContaining({ confirmImpact: true }))

    saveMock.mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "Check the rule.", fieldErrors: { "then.graceDays": ["In Automatic, the grace period is at least 7 days."] } })
    act(() => result.current.save.confirmImpact())
    await waitFor(() => expect(result.current.save.pending).toBeNull())
    expect(setErrors).toHaveBeenLastCalledWith([expect.objectContaining({ key: "then.graceDays", message: "In Automatic, the grace period is at least 7 days." })], true)
  })

  it("creates a new rule: the toast, the start draft again, and the rule page", async () => {
    createMock.mockResolvedValue({ success: true, data: { ruleId: "rule-new", dryRunQueued: false } })
    const { result } = renderSave(blank())
    act(() => result.current.state.dispatch(addRow))
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/cleanup/rules/rule-new"))
    expect(createMock).toHaveBeenCalledWith({ name: "New rule", definition: expect.objectContaining({ level: "movie" }) })
    expect(toast.showSuccess).toHaveBeenCalledWith(EDITOR_TOASTS.created)
    expect(result.current.state.draft.draft).toEqual(DRAFT)
    expect(takeTitleFocus("rule-new")).toBe(true)
  })

  it("shows a refused create as a toast or as field errors", async () => {
    const { result, setErrors } = renderSave(blank())
    createMock.mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "You can have at most 50 rules." })
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith("You can have at most 50 rules."))
    createMock.mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "Check the rule.", fieldErrors: { libraries: ["Choose at least one library."] } })
    act(() => result.current.save.save("save"))
    await waitFor(() => expect(setErrors).toHaveBeenCalledWith([expect.objectContaining({ key: "libraries" })], true))
    expect(push).not.toHaveBeenCalled()
  })
})
