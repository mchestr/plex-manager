/**
 * The Skills block of Assistant sources: a row per skill source with its
 * On/Off and moving-ref badges, Refresh (which says only that it refreshed),
 * and Check skills, a dialog that opens at once with a Spinner and shows only
 * that row's commit, skills and problems. The Add and Edit Sheets carry the
 * warning and the form.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { checkSkills, deleteSkillSource, refreshSkillSource, saveSkillSource } from "@/actions/admin/assistant-skills"
import { SkillSourcesBlock } from "@/components/admin/settings/assistant/skill-sources-block"
import type { SkillSourceSettings } from "@/lib/data/assistant-sources"

jest.mock("@/actions/admin/assistant-skills", () => ({
  saveSkillSource: jest.fn(),
  deleteSkillSource: jest.fn(),
  refreshSkillSource: jest.fn(),
  checkSkills: jest.fn(),
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

type CheckResult = Awaited<ReturnType<typeof checkSkills>>

const SHA = "0123456789abcdef0123456789abcdef01234567"
const WARNING = "The assistant follows skills as instructions. Add only repositories you control, and pin a tag or commit."
const RATE_LIMITED = "GitHub's rate limit was reached; add a token (it resets within the hour)"
const OPS: SkillSourceSettings = { id: "s1", name: "Ops", repo: "octo/skills", ref: "main", path: "", token: null, isActive: true, pinned: false }
const DOCS: SkillSourceSettings = { id: "s2", name: "Docs", repo: "octo/docs", ref: "v2", path: "skills", token: null, isActive: true, pinned: false }
const PINNED: SkillSourceSettings = { ...OPS, id: "s3", name: "Pinned", ref: SHA, pinned: true }
const CHECK: CheckResult = {
  success: true,
  data: {
    sources: [
      { name: "Docs", sha: null, pinned: false },
      { name: "Ops", sha: SHA, pinned: false },
    ],
    skills: [{ name: "triage", source: "Ops", path: "triage/SKILL.md" }],
    problems: [{ source: "Docs", path: null, reason: "rate_limited" }],
  },
}

/** Opens one row's Check skills, scoped to that row, and returns the dialog. */
async function openCheck(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(within(screen.getByTestId(`settings-skill-${id}`)).getByTestId("settings-skill-check"))
  return screen.findByTestId("settings-skill-check-dialog")
}

beforeEach(() => jest.clearAllMocks())

describe("SkillSourcesBlock", () => {
  it("says none are set up yet", () => {
    render(<SkillSourcesBlock sources={[]} />)
    expect(screen.getByTestId("settings-skill-list")).toHaveTextContent("None yet.")
  })

  it("lists each source with its repository, and warns about a moving ref but not a pinned commit", () => {
    render(<SkillSourcesBlock sources={[DOCS, PINNED]} />)
    const docs = screen.getByTestId("settings-skill-s2")
    expect(docs).toHaveTextContent("octo/docs@v2/skills")
    expect(docs).toHaveTextContent("On")
    expect(within(docs).getByTestId("settings-skill-moving-ref")).toHaveTextContent("Follows a moving ref")
    expect(within(screen.getByTestId("settings-skill-s3")).queryByTestId("settings-skill-moving-ref")).not.toBeInTheDocument()
  })

  it.each([
    ["a branch", OPS],
    ["a pinned", PINNED],
  ])("Refresh on %s row refreshes the source and says only that", async (_, source) => {
    const user = userEvent.setup()
    jest.mocked(refreshSkillSource).mockResolvedValue({ success: true, data: null })
    render(<SkillSourcesBlock sources={[source]} />)

    await user.click(within(screen.getByTestId(`settings-skill-${source.id}`)).getByTestId("settings-skill-refresh"))

    expect(refreshSkillSource).toHaveBeenCalledWith({ id: source.id })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Skill source refreshed"))
  })

  it("says why a Refresh failed", async () => {
    const user = userEvent.setup()
    jest.mocked(refreshSkillSource).mockResolvedValue({ success: false, code: "NOT_FOUND", error: "That skill source no longer exists" })
    render(<SkillSourcesBlock sources={[OPS]} />)

    await user.click(screen.getByTestId("settings-skill-refresh"))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("That skill source no longer exists"))
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  describe("Check skills", () => {
    it("shows Ops' skill and full commit, and not Docs' rate limit", async () => {
      const user = userEvent.setup()
      jest.mocked(checkSkills).mockResolvedValue(CHECK)
      render(<SkillSourcesBlock sources={[OPS, DOCS]} />)

      const dialog = await openCheck(user, "s1")

      expect(await within(dialog).findByText("triage")).toBeInTheDocument()
      expect(within(dialog).getByText(SHA)).toBeInTheDocument()
      expect(within(dialog).queryByText(RATE_LIMITED)).not.toBeInTheDocument()
      expect(within(dialog).queryByText("Not read")).not.toBeInTheDocument()
      expect(checkSkills).toHaveBeenCalledTimes(1)
    })

    it("shows Docs' unread commit and its rate limit, and not Ops' skill", async () => {
      const user = userEvent.setup()
      jest.mocked(checkSkills).mockResolvedValue(CHECK)
      render(<SkillSourcesBlock sources={[OPS, DOCS]} />)

      const dialog = await openCheck(user, "s2")

      expect(await within(dialog).findByText(RATE_LIMITED)).toBeInTheDocument()
      expect(within(dialog).getByText("Not read")).toBeInTheDocument()
      expect(within(dialog).queryByText("triage")).not.toBeInTheDocument()
      expect(within(dialog).queryByText(SHA)).not.toBeInTheDocument()
    })

    it("says an Off source is not read, without checking", async () => {
      const user = userEvent.setup()
      render(<SkillSourcesBlock sources={[{ ...OPS, isActive: false }]} />)

      const dialog = await openCheck(user, "s1")

      expect(dialog).toHaveTextContent("This source is off, so the assistant does not read it.")
      expect(dialog.querySelector('[data-slot="spinner"]')).toBeNull()
      expect(checkSkills).not.toHaveBeenCalled()
    })

    it("opens at once with a Spinner, then drops it to show a failed check's error", async () => {
      const user = userEvent.setup()
      let finish: (value: CheckResult) => void = () => {}
      jest.mocked(checkSkills).mockReturnValue(new Promise((resolve) => (finish = resolve)))
      render(<SkillSourcesBlock sources={[OPS]} />)

      const dialog = await openCheck(user, "s1")
      expect(dialog.querySelector('[data-slot="spinner"]')).not.toBeNull()

      finish({ success: false, code: "RATE_LIMITED", error: "Too many requests. Try again in a minute." })

      expect(await within(dialog).findByText("Too many requests. Try again in a minute.")).toBeInTheDocument()
      expect(dialog.querySelector('[data-slot="spinner"]')).toBeNull()
    })

    it("says so when the check cannot reach the server", async () => {
      const user = userEvent.setup()
      jest.mocked(checkSkills).mockRejectedValue(new Error("Failed to fetch"))
      render(<SkillSourcesBlock sources={[OPS]} />)

      const dialog = await openCheck(user, "s1")

      expect(await within(dialog).findByText("Could not check the skills. Try again.")).toBeInTheDocument()
      expect(dialog.querySelector('[data-slot="spinner"]')).toBeNull()
    })

    it("puts each problem in plain copy, with its path", async () => {
      const user = userEvent.setup()
      const problem = (reason: Extract<CheckResult, { success: true }>["data"]["problems"][number]["reason"], path: string | null, detail?: string) => ({
        source: "Ops",
        path,
        reason,
        ...(detail ? { detail } : {}),
      })
      jest.mocked(checkSkills).mockResolvedValue({
        success: true,
        data: {
          sources: [{ name: "Ops", sha: SHA, pinned: false }],
          skills: [],
          problems: [
            problem("invalid_frontmatter", "bad/SKILL.md", "The description must be 1 to 1,024 characters"),
            problem("duplicate_name", "deploy/SKILL.md", "Alpha"),
            problem("unreachable", "gone/SKILL.md"),
            problem("rate_limited", "slow/SKILL.md"),
            problem("not_read", "late/SKILL.md"),
            problem("not_in_prompt", "full/SKILL.md"),
            problem("too_long", "long/SKILL.md"),
            problem("listing_truncated", null),
          ],
        },
      })
      render(<SkillSourcesBlock sources={[OPS]} />)

      const dialog = await openCheck(user, "s1")

      for (const copy of [
        "Its SKILL.md frontmatter is not valid",
        "The description must be 1 to 1,024 characters",
        "Hidden by a skill with the same name in Alpha (the source whose name sorts first wins)",
        "Could not read the repository",
        RATE_LIMITED,
        "Not read: only the first 50 SKILL.md files are read. Remove skills or set a folder.",
        "Left out: the skills list is full. Shorten descriptions or remove skills.",
        "Longer than 12,000 characters; the assistant reads only the start",
        "Only the first 300 Markdown files were read; set a folder",
      ]) {
        expect(await within(dialog).findByText(copy)).toBeInTheDocument()
      }
      expect(within(dialog).getByText("deploy/SKILL.md")).toBeInTheDocument()
      expect(within(dialog).getByText("Follows a moving ref")).toBeInTheDocument()
    })
  })

  describe("Add and Edit", () => {
    it("adds a source from a Sheet that warns, explains the ref and closes on save", async () => {
      const user = userEvent.setup()
      jest.mocked(saveSkillSource).mockResolvedValue({ success: true, data: { id: "s9" } })
      render(<SkillSourcesBlock sources={[]} />)

      await user.click(screen.getByTestId("settings-skill-add-open"))
      const sheet = screen.getByTestId("settings-skill-add-sheet")
      expect(sheet).toHaveTextContent(WARNING)
      expect(sheet).toHaveTextContent("A commit keeps the skills fixed until you change it. A tag changes only if someone moves it; a branch changes whenever anyone pushes to it.")
      expect(sheet).toHaveTextContent("Needed for a private repository, and recommended for a branch.")
      expect(screen.getByLabelText("Commit, tag or branch")).toHaveValue("main")
      expect(screen.getByRole("checkbox", { name: "Use this skill source" })).toBeChecked()

      await user.type(screen.getByTestId("settings-skill-name"), "Ops")
      await user.type(screen.getByTestId("settings-skill-repo"), "octo/skills")
      await user.clear(screen.getByTestId("settings-skill-ref"))
      await user.type(screen.getByTestId("settings-skill-ref"), SHA)
      await user.click(screen.getByTestId("settings-skill-active"))
      await user.click(screen.getByTestId("settings-skill-save"))

      expect(saveSkillSource).toHaveBeenCalledWith({ name: "Ops", repo: "octo/skills", ref: SHA, path: "", token: "", isActive: false })
      expect(mockShowSuccess).toHaveBeenCalledWith("Skill source saved")
      await waitFor(() => expect(screen.queryByTestId("settings-skill-add-sheet")).not.toBeInTheDocument())
    })

    it("keeps a refused save open on the field that says what is wrong", async () => {
      const user = userEvent.setup()
      jest.mocked(saveSkillSource).mockResolvedValue({
        success: false,
        code: "CONFLICT",
        error: "A skill source with that name already exists",
        fieldErrors: { name: ["Already in use"] },
      })
      render(<SkillSourcesBlock sources={[OPS]} />)

      await user.click(screen.getByTestId("settings-skill-edit-open"))
      expect(screen.getByTestId("settings-skill-edit-sheet")).toHaveTextContent(WARNING)
      await user.type(screen.getByTestId("settings-skill-name"), " 2")
      await user.click(screen.getByTestId("settings-skill-save"))

      expect(saveSkillSource).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", name: "Ops 2", token: "" }))
      expect(await screen.findByText("Already in use")).toBeInTheDocument()
      expect(mockShowError).toHaveBeenCalledWith("A skill source with that name already exists")
      expect(screen.getByTestId("settings-skill-edit-sheet")).toBeInTheDocument()
    })

    it("removes a source from its Edit Sheet", async () => {
      const user = userEvent.setup()
      jest.mocked(deleteSkillSource).mockResolvedValue({ success: true, data: null })
      render(<SkillSourcesBlock sources={[OPS]} />)

      await user.click(within(screen.getByTestId("settings-skill-s1")).getByTestId("settings-skill-edit-open"))
      await user.click(screen.getByTestId("settings-skill-delete"))
      expect(await screen.findByTestId("settings-skill-remove")).toHaveTextContent("Remove Ops?")
      await user.click(screen.getByTestId("settings-skill-remove-confirm"))

      expect(deleteSkillSource).toHaveBeenCalledWith({ id: "s1" })
      await waitFor(() => expect(screen.queryByTestId("settings-skill-edit-sheet")).not.toBeInTheDocument())
    })
  })
})
