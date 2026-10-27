/**
 * The Assistant sources section: the lists, an MCP server's per-tool switches
 * (off until switched on, saved with the form), a secret that is never shown,
 * and the knowledge base form.
 */

import { render, screen } from "@testing-library/react"
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
    expect(screen.getByTestId("settings-mcp-m1")).toHaveTextContent("1 tools on")
    expect(screen.getByTestId("settings-knowledge-k1")).toHaveTextContent("mchestr/knowledgebase@main/docs")
  })

  it("lists a server's tools, leaves new ones off and saves the switches", async () => {
    const user = userEvent.setup()
    jest.mocked(discoverMcpTools).mockResolvedValue({
      success: true,
      data: { tools: [{ name: "search", description: "Find", readOnlyHint: true }, { name: "delete", description: "Remove", readOnlyHint: false }] },
    })
    jest.mocked(saveMcpServer).mockResolvedValue({ success: true, data: { id: "m1" } })
    render(<AssistantSection sources={SOURCES} />)

    await user.click(screen.getByTestId("settings-mcp-edit-open"))
    await user.click(screen.getByTestId("settings-mcp-discover"))

    const search = await screen.findByRole("switch", { name: "Allow search" })
    const remove = screen.getByRole("switch", { name: "Allow delete" })
    expect(search).toBeChecked()
    expect(remove).not.toBeChecked()
    expect(screen.getByTestId("settings-mcp-tool-delete")).toHaveTextContent("can change data")

    await user.click(remove)
    await user.click(screen.getByTestId("settings-mcp-save"))

    expect(saveMcpServer).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", enabledTools: ["search", "delete"], authHeaderSecret: "" }))
  })

  it("shows a saved header value as masked, never as a value", async () => {
    const user = userEvent.setup()
    render(<AssistantSection sources={SOURCES} />)

    await user.click(screen.getByTestId("settings-mcp-edit-open"))

    const value = screen.getByTestId("settings-mcp-header-value")
    expect(value).toHaveValue("")
    expect(value).toHaveAttribute("placeholder", "••••••••••••1234")
  })

  it("shows the toast error when the server cannot be listed", async () => {
    const user = userEvent.setup()
    jest.mocked(discoverMcpTools).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "The server could not be reached." })
    render(<AssistantSection sources={SOURCES} />)

    await user.click(screen.getByTestId("settings-mcp-edit-open"))
    await user.click(screen.getByTestId("settings-mcp-discover"))

    expect(mockShowError).toHaveBeenCalledWith("The server could not be reached.")
  })

  it("adds a knowledge base and reports the documents found", async () => {
    const user = userEvent.setup()
    jest.mocked(saveKnowledgeSource).mockResolvedValue({ success: true, data: { id: "k2", docCount: 12 } })
    render(<AssistantSection sources={EMPTY} />)

    await user.click(screen.getByTestId("settings-knowledge-add-open"))
    await user.type(screen.getByTestId("settings-knowledge-name"), "Runbooks")
    await user.type(screen.getByTestId("settings-knowledge-repo"), "mchestr/knowledgebase")
    await user.click(screen.getByTestId("settings-knowledge-save"))

    expect(saveKnowledgeSource).toHaveBeenCalledWith(expect.objectContaining({ name: "Runbooks", repo: "mchestr/knowledgebase", ref: "main" }))
    expect(mockShowSuccess).toHaveBeenCalledWith("Knowledge base saved: 12 documents found")
  })
})
