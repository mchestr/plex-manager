/**
 * The Assistant sources section: the lists are the view, with no section
 * Edit, and each row's Sheet is its edit mode. An MCP server's per-tool
 * checkboxes (off until allowed, saved with the form), a secret that is never
 * shown, the knowledge base form, and the Sheet's save and close rules.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { discoverMcpTools, saveKnowledgeSource, saveMcpServer } from "@/actions/admin/assistant-sources"
import { AssistantSection } from "@/components/admin/settings/sections/assistant-section"
import type { AssistantSources, McpServerSettings } from "@/lib/data/assistant-sources"

jest.mock("@/actions/admin/assistant-sources", () => ({
  saveMcpServer: jest.fn(),
  deleteMcpServer: jest.fn(),
  discoverMcpTools: jest.fn(),
  saveKnowledgeSource: jest.fn(),
  deleteKnowledgeSource: jest.fn(),
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const SERVER: McpServerSettings = {
  id: "m1",
  name: "Memini",
  url: "https://mcp.example.com/mcp",
  authHeaderName: "Authorization",
  authSecret: { last4: "1234", origin: "https://mcp.example.com" },
  isActive: true,
  enabledTools: ["search"],
}
const EMPTY: AssistantSources = { mcpServers: [], knowledgeSources: [] }
const SOURCES: AssistantSources = {
  mcpServers: [SERVER],
  knowledgeSources: [{ id: "k1", name: "Runbooks", repo: "mchestr/knowledgebase", ref: "main", path: "docs", token: null, isActive: true }],
}

async function openServer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-mcp-edit-open"))
  return screen.getByTestId("settings-mcp-edit-sheet")
}

beforeEach(() => jest.clearAllMocks())

describe("AssistantSection", () => {
  it("says none are set up yet", () => {
    render(<AssistantSection sources={EMPTY} />)
    expect(screen.getByTestId("settings-mcp-list")).toHaveTextContent("None yet.")
    expect(screen.getByTestId("settings-knowledge-list")).toHaveTextContent("None yet.")
  })

  it("lists each server with its tool count and each knowledge base with its repository", () => {
    render(<AssistantSection sources={SOURCES} />)
    expect(screen.getByTestId("settings-mcp-m1")).toHaveTextContent("Memini")
    expect(screen.getByTestId("settings-mcp-m1")).toHaveTextContent("1 tool on")
    expect(screen.getByTestId("settings-knowledge-k1")).toHaveTextContent("mchestr/knowledgebase@main/docs")
  })

  it("counts tools in the plural and says off for a server not in use", () => {
    const sources: AssistantSources = {
      mcpServers: [
        { ...SERVER, enabledTools: ["search", "fetch"] },
        { ...SERVER, id: "m2", name: "Idle", isActive: false },
      ],
      knowledgeSources: [],
    }
    render(<AssistantSection sources={sources} />)
    expect(screen.getByTestId("settings-mcp-m1")).toHaveTextContent("2 tools on")
    expect(screen.getByTestId("settings-mcp-m2")).toHaveTextContent("Off")
  })

  it("has no section Edit: the rows and Add open their Sheets", () => {
    render(<AssistantSection sources={SOURCES} />)
    expect(screen.queryByTestId("settings-assistant-edit")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit Memini" })).toHaveAttribute("data-testid", "settings-mcp-edit-open")
    expect(screen.getByRole("button", { name: "Add MCP server" })).toHaveAttribute("data-testid", "settings-mcp-add-open")
    expect(screen.getByRole("button", { name: "Add knowledge base" })).toHaveAttribute("data-testid", "settings-knowledge-add-open")
  })

  it("lists a server's tools, leaves new ones off and saves the checkboxes", async () => {
    const user = userEvent.setup()
    jest.mocked(discoverMcpTools).mockResolvedValue({
      success: true,
      data: { tools: [{ name: "search", description: "Find", readOnlyHint: true }, { name: "delete", description: "Remove", readOnlyHint: false }] },
    })
    jest.mocked(saveMcpServer).mockResolvedValue({ success: true, data: { id: "m1" } })
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    await user.click(screen.getByTestId("settings-mcp-discover"))

    const search = await screen.findByRole("checkbox", { name: "Allow search" })
    const remove = screen.getByRole("checkbox", { name: "Allow delete" })
    expect(search).toBeChecked()
    expect(remove).not.toBeChecked()
    expect(screen.getByTestId("settings-mcp-tool-delete")).toHaveTextContent("Can change data")

    await user.click(remove)
    await user.click(screen.getByTestId("settings-mcp-save"))

    expect(saveMcpServer).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", enabledTools: ["search", "delete"], authHeaderSecret: "" }))
    expect(mockShowSuccess).toHaveBeenCalledWith("MCP server saved")
    // A successful save closes the Sheet: back to the list
    await waitFor(() => expect(screen.queryByTestId("settings-mcp-edit-sheet")).not.toBeInTheDocument())
  })

  it("Use this server is a checkbox that saves with the form", async () => {
    const user = userEvent.setup()
    jest.mocked(saveMcpServer).mockResolvedValue({ success: true, data: { id: "m1" } })
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    const active = screen.getByTestId("settings-mcp-active")
    expect(active).toHaveRole("checkbox")
    expect(screen.getByRole("checkbox", { name: "Use this server" })).toBeChecked()

    await user.click(active)
    expect(saveMcpServer).not.toHaveBeenCalled()
    await user.click(screen.getByTestId("settings-mcp-save"))

    expect(saveMcpServer).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", isActive: false }))
  })

  it("shows a saved header value as masked, never as a value", async () => {
    const user = userEvent.setup()
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)

    const value = screen.getByTestId("settings-mcp-header-value")
    expect(value).toHaveValue("")
    expect(value).toHaveAttribute("placeholder", "••••••••••••1234")
  })

  it("shows the toast error when the server cannot be listed", async () => {
    const user = userEvent.setup()
    jest.mocked(discoverMcpTools).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "The server could not be reached." })
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    await user.click(screen.getByTestId("settings-mcp-discover"))

    expect(mockShowError).toHaveBeenCalledWith("The server could not be reached.")
  })

  it("Save with nothing changed closes the Sheet without saving", async () => {
    const user = userEvent.setup()
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    const save = screen.getByTestId("settings-mcp-save")
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(screen.queryByTestId("settings-mcp-edit-sheet")).not.toBeInTheDocument())
    expect(saveMcpServer).not.toHaveBeenCalled()
  })

  it("a failed save keeps the Sheet open on the field that says what is wrong", async () => {
    const user = userEvent.setup()
    jest.mocked(saveMcpServer).mockResolvedValue({ success: false, code: "VALIDATION", error: "Check the fields", fieldErrors: { url: ["Enter an https URL"] } })
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    await user.type(screen.getByTestId("settings-mcp-url"), "x")
    await user.click(screen.getByTestId("settings-mcp-save"))

    expect(await screen.findByText("Enter an https URL")).toBeInTheDocument()
    expect(screen.getByTestId("settings-mcp-edit-sheet")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("settings-mcp-url")).toHaveFocus())
  })

  it("asks before closing a Sheet with unsaved changes: Keep editing stays, Discard closes", async () => {
    const user = userEvent.setup()
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    await user.type(screen.getByTestId("settings-mcp-name"), " 2")
    await user.keyboard("{Escape}")

    const dialog = await screen.findByTestId("settings-mcp-discard-dialog")
    expect(dialog).toHaveTextContent("Discard changes to Memini?")
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }))

    await waitFor(() => expect(screen.queryByTestId("settings-mcp-discard-dialog")).not.toBeInTheDocument())
    expect(screen.getByTestId("settings-mcp-name")).toHaveValue("Memini 2")

    // Cancel and the Close button ask too
    await user.click(screen.getByTestId("settings-mcp-cancel"))
    await user.click(within(await screen.findByTestId("settings-mcp-discard-dialog")).getByRole("button", { name: "Keep editing" }))
    await waitFor(() => expect(screen.queryByTestId("settings-mcp-discard-dialog")).not.toBeInTheDocument())
    await user.click(within(screen.getByTestId("settings-mcp-edit-sheet")).getByTestId("dialog-close"))

    await user.click(await screen.findByTestId("settings-mcp-discard-dialog-confirm"))

    await waitFor(() => expect(screen.queryByTestId("settings-mcp-edit-sheet")).not.toBeInTheDocument())
    expect(saveMcpServer).not.toHaveBeenCalled()

    // Opened again, the form starts from the saved values
    await openServer(user)
    expect(screen.getByTestId("settings-mcp-name")).toHaveValue("Memini")
  })

  it("Cancel on a clean Sheet closes it without asking", async () => {
    const user = userEvent.setup()
    render(<AssistantSection sources={SOURCES} />)

    await openServer(user)
    await user.click(screen.getByTestId("settings-mcp-cancel"))

    await waitFor(() => expect(screen.queryByTestId("settings-mcp-edit-sheet")).not.toBeInTheDocument())
    expect(screen.queryByTestId("settings-mcp-discard-dialog")).not.toBeInTheDocument()
  })

  it("adds a knowledge base, reports the documents found and closes the Sheet", async () => {
    const user = userEvent.setup()
    jest.mocked(saveKnowledgeSource).mockResolvedValue({ success: true, data: { id: "k2", docCount: 12 } })
    render(<AssistantSection sources={EMPTY} />)

    await user.click(screen.getByTestId("settings-knowledge-add-open"))
    expect(screen.getByRole("checkbox", { name: "Use this knowledge base" })).toBeChecked()
    await user.type(screen.getByTestId("settings-knowledge-name"), "Runbooks")
    await user.type(screen.getByTestId("settings-knowledge-repo"), "mchestr/knowledgebase")
    await user.click(screen.getByTestId("settings-knowledge-save"))

    expect(saveKnowledgeSource).toHaveBeenCalledWith(expect.objectContaining({ name: "Runbooks", repo: "mchestr/knowledgebase", ref: "main" }))
    expect(mockShowSuccess).toHaveBeenCalledWith("Knowledge base saved. Found 12 documents.")
    await waitFor(() => expect(screen.queryByTestId("settings-knowledge-add-sheet")).not.toBeInTheDocument())
  })

  it("keeps a knowledge base Sheet open while its save reads GitHub, without offering to discard it", async () => {
    const user = userEvent.setup()
    let finish: (value: { success: true; data: { id: string; docCount: number } }) => void = () => {}
    jest.mocked(saveKnowledgeSource).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<AssistantSection sources={EMPTY} />)

    await user.click(screen.getByTestId("settings-knowledge-add-open"))
    await user.type(screen.getByTestId("settings-knowledge-name"), "Runbooks")
    await user.type(screen.getByTestId("settings-knowledge-repo"), "mchestr/knowledgebase")
    await user.click(screen.getByTestId("settings-knowledge-save"))
    await user.keyboard("{Escape}")

    expect(screen.queryByTestId("settings-knowledge-discard-dialog")).not.toBeInTheDocument()
    expect(screen.getByTestId("settings-knowledge-add-sheet")).toBeInTheDocument()

    finish({ success: true, data: { id: "k2", docCount: 1 } })
    await waitFor(() => expect(screen.queryByTestId("settings-knowledge-add-sheet")).not.toBeInTheDocument())
    expect(mockShowSuccess).toHaveBeenCalledWith("Knowledge base saved. Found 1 document.")
  })

  it("asks before closing a new knowledge base with something typed", async () => {
    const user = userEvent.setup()
    render(<AssistantSection sources={EMPTY} />)

    await user.click(screen.getByTestId("settings-knowledge-add-open"))
    await user.type(screen.getByTestId("settings-knowledge-name"), "Runbooks")
    await user.keyboard("{Escape}")

    expect(await screen.findByTestId("settings-knowledge-discard-dialog")).toHaveTextContent("Discard changes to the new knowledge base?")
  })
})
