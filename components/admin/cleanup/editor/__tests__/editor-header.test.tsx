/**
 * The editor header (UX 4.3.2, 8.4): the breadcrumbs, the title with Rename,
 * the meta line, and the buttons by mode and by dirty state. "Save and turn
 * on..." runs the save, the discard dialog resets the draft, a new rule has
 * only Discard and Create, and without Redis the next step says why it is
 * off.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { createRef } from "react"

import { EditorHeader, type EditorHeaderProps, REDIS_REASON } from "@/components/admin/cleanup/editor/editor-header"
import { NOW } from "@/components/admin/cleanup/preview/__tests__/fixtures"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }) }))
jest.mock("@/actions/admin/cleanup-rules", () => ({
  duplicateCleanupRule: jest.fn(),
  runCleanupRuleDryRun: jest.fn(),
  deleteCleanupRule: jest.fn(),
  moveCleanupRuleToDryRun: jest.fn(),
  setCleanupRuleReviewFirst: jest.fn(),
}))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

function setup(overrides: Partial<EditorHeaderProps> = {}) {
  const props: EditorHeaderProps = {
    ruleId: "rule-1",
    name: "Old films",
    savedName: "Old films",
    mode: "dryRun",
    level: "movie",
    lastDryRun: { at: "2026-11-08T03:07:00.000Z", matches: 195 },
    now: NOW,
    dirty: false,
    saving: false,
    redis: true,
    leavingCount: 0,
    titleRef: createRef<HTMLHeadingElement>(),
    onRename: jest.fn(),
    onDiscard: jest.fn(),
    onSave: jest.fn(),
    onSaveThenTurnOn: jest.fn(),
    onRuleChanged: jest.fn(),
    ...overrides,
  }
  const user = userEvent.setup()
  const view = render(<EditorHeader {...props} />)
  return { user, props, ...view }
}

const tid = (id: string) => screen.getByTestId(id)
const maybe = (id: string) => screen.queryByTestId(id)

describe("EditorHeader", () => {
  it("shows a clean Dry run rule: breadcrumbs, title, meta, Turn on as a link and a disabled Save", async () => {
    const { container } = setup()
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(crumbs).toHaveTextContent("Media cleanup/Rules/Old films")
    expect(tid("admin-cleanup-editor-header-crumb-0")).toHaveAttribute("href", "/admin/cleanup")
    expect(screen.getByRole("heading", { level: 1, name: "Old films" })).toHaveAttribute("tabindex", "-1")
    expect(tid("admin-cleanup-editor-mode")).toHaveTextContent("Dry run")
    expect(tid("admin-cleanup-editor-last-dry-run-timestamp")).toHaveTextContent("Last dry run 3:07 AM today: 195 matches")
    expect(maybe("admin-cleanup-editor-unsaved")).toBeNull()
    expect(maybe("admin-cleanup-editor-discard")).toBeNull()
    expect(tid("admin-cleanup-editor-menu")).toHaveAccessibleName("More actions")
    const next = tid("admin-cleanup-editor-turn-on")
    expect(next).toHaveTextContent("Turn on...")
    expect(next).toHaveAttribute("href", "/admin/cleanup/rules/rule-1/turn-on")
    const save = tid("admin-cleanup-editor-save")
    expect(save).toHaveTextContent("Save rule")
    expect(save).toHaveAttribute("aria-disabled", "true")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("labels the next step Save and turn on while the draft has changes, and saves first", async () => {
    const { user, props } = setup({ dirty: true, lastDryRun: { at: "2026-11-01T03:07:00.000Z", matches: 1 } })
    expect(tid("admin-cleanup-editor-unsaved")).toHaveTextContent("Unsaved changes")
    expect(tid("admin-cleanup-editor-last-dry-run-timestamp")).toHaveTextContent("Last dry run Nov 1, 2026, 3:07 AM: 1 match")
    const next = tid("admin-cleanup-editor-turn-on")
    expect(next).toHaveTextContent("Save and turn on...")
    expect(next).not.toHaveAttribute("href")
    await user.click(next)
    expect(props.onSaveThenTurnOn).toHaveBeenCalledTimes(1)
    await user.click(tid("admin-cleanup-editor-save"))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it("reads Change mode on a live rule, and Save and change mode with changes", () => {
    const { rerender, props } = setup({ mode: "reviewFirst", lastDryRun: null })
    expect(tid("admin-cleanup-editor-mode")).toHaveTextContent("Review first")
    expect(maybe("admin-cleanup-editor-last-dry-run-timestamp")).toBeNull()
    expect(maybe("admin-cleanup-editor-turn-on")).toBeNull()
    expect(tid("admin-cleanup-editor-change-mode")).toHaveTextContent("Change mode...")
    expect(tid("admin-cleanup-editor-change-mode")).toHaveAttribute("href", "/admin/cleanup/rules/rule-1/turn-on")
    rerender(<EditorHeader {...props} dirty />)
    expect(tid("admin-cleanup-editor-change-mode")).toHaveTextContent("Save and change mode...")
  })

  it("shows a new rule with only Discard and Create", async () => {
    const { user, props, rerender } = setup({ ruleId: null, name: "New rule", savedName: "New rule", lastDryRun: null })
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Media cleanup/Rules/New rule")
    expect(maybe("admin-cleanup-editor-menu")).toBeNull()
    expect(maybe("admin-cleanup-editor-turn-on")).toBeNull()
    expect(maybe("admin-cleanup-editor-save")).toBeNull()
    expect(maybe("admin-cleanup-editor-discard")).toBeNull()
    await user.click(tid("admin-cleanup-editor-create"))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    rerender(<EditorHeader {...props} dirty saving />)
    expect(tid("admin-cleanup-editor-discard")).toBeInTheDocument()
    expect(tid("admin-cleanup-editor-create")).toHaveTextContent("Creating")
  })

  it("keeps Turn on focusable but off without Redis, with the reason", () => {
    setup({ redis: false, dirty: true })
    const next = tid("admin-cleanup-editor-turn-on")
    expect(next).toHaveAttribute("aria-disabled", "true")
    expect(next).toHaveAccessibleDescription(REDIS_REASON)
  })

  it("shows Saving on Save rule while the save runs", () => {
    setup({ dirty: true, saving: true })
    expect(tid("admin-cleanup-editor-save")).toHaveTextContent("Saving")
    expect(tid("admin-cleanup-editor-turn-on")).toBeDisabled()
  })

  it("asks before it discards, then resets and moves focus to the title", async () => {
    const titleRef = createRef<HTMLHeadingElement>()
    const { user, props } = setup({ dirty: true, titleRef, savedName: "Movies nobody watches", name: "Movies nobody watches 2" })
    await user.click(tid("admin-cleanup-editor-discard"))
    const dialog = await screen.findByTestId("admin-cleanup-editor-discard-dialog")
    expect(dialog).toHaveTextContent("Discard changes to Movies nobody watches?")
    expect(props.onDiscard).not.toHaveBeenCalled()
    await user.click(tid("admin-cleanup-editor-discard-dialog-confirm"))
    expect(props.onDiscard).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(maybe("admin-cleanup-editor-discard-dialog")).toBeNull())
    // The Discard button went with the changes: focus goes to the title once the dialog has gone
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    await waitFor(() => expect(titleRef.current).toHaveFocus())
  })

  it("renames: Enter saves the trimmed name into the draft, Esc cancels, and an empty name says so", async () => {
    const { user, props } = setup()
    await user.click(tid("admin-cleanup-editor-rename"))
    const input = tid("admin-cleanup-editor-rename-input")
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveValue("Old films")
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("sr-only")
    await user.clear(input)
    await user.type(input, "  Films nobody plays  {Enter}")
    expect(props.onRename).toHaveBeenCalledWith("Films nobody plays")
    await waitFor(() => expect(tid("admin-cleanup-editor-rename")).toHaveFocus())

    await user.click(tid("admin-cleanup-editor-rename"))
    await user.keyboard("{Escape}")
    expect(maybe("admin-cleanup-editor-rename-input")).toBeNull()

    await user.click(tid("admin-cleanup-editor-rename"))
    await user.clear(tid("admin-cleanup-editor-rename-input"))
    await user.click(tid("admin-cleanup-editor-rename-save"))
    expect(tid("admin-cleanup-editor-rename-input")).toHaveAccessibleDescription("Enter a name for the rule.")
    await user.click(tid("admin-cleanup-editor-rename-cancel"))
    expect(props.onRename).toHaveBeenCalledTimes(1)
  })

  it("keeps the old name when Save does not change it", async () => {
    const { user, props } = setup()
    await user.click(tid("admin-cleanup-editor-rename"))
    await user.click(tid("admin-cleanup-editor-rename-save"))
    expect(props.onRename).not.toHaveBeenCalled()
    expect(maybe("admin-cleanup-editor-rename-input")).toBeNull()
  })
})
