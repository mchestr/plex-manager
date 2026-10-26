/**
 * @jest-environment node
 *
 * MCP server and knowledge base actions: admin only, an https-or-http URL
 * without a query, secrets kept only for their origin, audited without the
 * secret, and a tool off until the admin switches it on.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { deleteKnowledgeSource, deleteMcpServer, discoverMcpTools, saveKnowledgeSource, saveMcpServer } from "@/actions/admin/assistant-sources"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { listDocs } from "@/lib/chatbot/knowledge/github"
import { mcpListTools } from "@/lib/chatbot/mcp/client"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/chatbot/mcp/client", () => ({ ...jest.requireActual("@/lib/chatbot/mcp/client"), mcpListTools: jest.fn() }))
jest.mock("@/lib/chatbot/knowledge/github", () => ({ listDocs: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const MCP = { name: "Memini", url: "https://mcp.example.com/mcp", authHeaderName: "Authorization", authHeaderSecret: "Bearer new", isActive: true, enabledTools: ["search", "search"] }
const STORED = { id: "m1", name: "Memini", url: "https://mcp.example.com/mcp", authHeaderName: "Authorization", authHeaderSecret: "Bearer old", isActive: true, enabledTools: [], createdAt: new Date(), updatedAt: new Date() }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  prismaMock.mcpServer.findFirst.mockResolvedValue(null)
  prismaMock.knowledgeSource.findFirst.mockResolvedValue(null)
})

describe("saveMcpServer", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m", isAdmin: false } })
    const result = await saveMcpServer(MCP)
    expect(result).toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.mcpServer.create).not.toHaveBeenCalled()
  })

  it.each(["ftp://mcp.example.com", "https://user:pw@mcp.example.com/mcp", "https://mcp.example.com/mcp?token=abc", "not a url"])("refuses the URL %s", async (url) => {
    const result = await saveMcpServer({ ...MCP, url })
    expect(result).toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { url: expect.any(Array) } })
    expect(prismaMock.mcpServer.create).not.toHaveBeenCalled()
  })

  it.each(["Content-Type", "accept", "Host", "Mcp-Session-Id"])("refuses the protocol header %s as the auth header", async (authHeaderName) => {
    const result = await saveMcpServer({ ...MCP, authHeaderName })
    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.mcpServer.create).not.toHaveBeenCalled()
  })

  it("creates a server, de-duplicates the enabled tools and audits without the secret", async () => {
    prismaMock.mcpServer.create.mockResolvedValue({ ...STORED, id: "new" })

    const result = await saveMcpServer(MCP)

    expect(result).toEqual({ success: true, data: { id: "new" } })
    expect(prismaMock.mcpServer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ url: "https://mcp.example.com/mcp", authHeaderSecret: "Bearer new", enabledTools: ["search"] }),
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_SOURCE_CHANGED, "admin-1", { kind: "mcp", action: "saved", id: "new" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("keeps the stored header value when it is left blank for the same origin", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(STORED)
    prismaMock.mcpServer.update.mockResolvedValue(STORED)

    await saveMcpServer({ ...MCP, id: "m1", authHeaderSecret: "", url: "https://mcp.example.com/other/path" })

    expect(prismaMock.mcpServer.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: expect.objectContaining({ authHeaderSecret: "Bearer old" }) })
  })

  it("never sends a stored header value to a new origin", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(STORED)

    const result = await saveMcpServer({ ...MCP, id: "m1", authHeaderSecret: "", url: "https://evil.example.com/mcp" })

    expect(result).toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { authHeaderSecret: expect.any(Array) } })
    expect(prismaMock.mcpServer.update).not.toHaveBeenCalled()
  })

  it("clears the stored value when the header name is removed", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(STORED)
    prismaMock.mcpServer.update.mockResolvedValue(STORED)

    await saveMcpServer({ ...MCP, id: "m1", authHeaderName: "", authHeaderSecret: "" })

    expect(prismaMock.mcpServer.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: expect.objectContaining({ authHeaderName: null, authHeaderSecret: null }) })
  })

  it("refuses a name that is taken", async () => {
    prismaMock.mcpServer.findFirst.mockResolvedValue({ id: "other" } as never)
    expect(await saveMcpServer(MCP)).toMatchObject({ success: false, code: "CONFLICT" })
  })

  it("reports an unknown id", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(null)
    expect(await saveMcpServer({ ...MCP, id: "gone" })).toMatchObject({ success: false, code: "NOT_FOUND" })
  })
})

describe("deleteMcpServer", () => {
  it("deletes and audits", async () => {
    prismaMock.mcpServer.deleteMany.mockResolvedValue({ count: 1 })
    expect(await deleteMcpServer({ id: "m1" })).toEqual({ success: true, data: null })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_SOURCE_CHANGED, "admin-1", { kind: "mcp", action: "deleted", id: "m1" })
  })

  it("reports a row that is already gone", async () => {
    prismaMock.mcpServer.deleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteMcpServer({ id: "m1" })).toMatchObject({ success: false, code: "NOT_FOUND" })
  })
})

describe("discoverMcpTools", () => {
  it("lists the tools with the stored credentials and no input schemas", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(STORED)
    jest.mocked(mcpListTools).mockResolvedValue({ ok: true, data: [{ name: "search", description: "d".repeat(500), inputSchema: { type: "object" }, readOnlyHint: true }] })

    const result = await discoverMcpTools({ id: "m1" })

    expect(mcpListTools).toHaveBeenCalledWith({ url: STORED.url, authHeaderName: "Authorization", authHeaderSecret: "Bearer old" })
    expect(result).toEqual({ success: true, data: { tools: [{ name: "search", description: "d".repeat(200), readOnlyHint: true }] } })
  })

  it("reports a server that is gone", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(null)
    expect(await discoverMcpTools({ id: "gone" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(mcpListTools).not.toHaveBeenCalled()
  })

  it("explains a failure without the server's text", async () => {
    prismaMock.mcpServer.findUnique.mockResolvedValue(STORED)
    jest.mocked(mcpListTools).mockResolvedValue({ ok: false, code: "UNAUTHORIZED" })
    expect(await discoverMcpTools({ id: "m1" })).toMatchObject({ success: false, error: "The server refused the credentials." })
  })
})

describe("saveKnowledgeSource", () => {
  const KB = { name: "Runbooks", repo: "mchestr/knowledgebase", ref: "main", path: "/docs/", token: "", isActive: true }

  it.each(["knowledgebase", "https://github.com/a/b", "a/b/c", "a/..", "../b", "./."])("refuses the repository %s", async (repo) => {
    expect(await saveKnowledgeSource({ ...KB, repo })).toMatchObject({ success: false, code: "VALIDATION" })
  })

  it("saves, trims the folder and reports how many documents were found", async () => {
    prismaMock.knowledgeSource.create.mockResolvedValue({ ...KB, id: "k1", token: null } as never)
    jest.mocked(listDocs).mockResolvedValue(["a.md", "b.md"])

    const result = await saveKnowledgeSource(KB)

    expect(result).toEqual({ success: true, data: { id: "k1", docCount: 2 } })
    expect(prismaMock.knowledgeSource.create).toHaveBeenCalledWith({ data: expect.objectContaining({ path: "docs", token: null }) })
  })

  it("reports an unknown id and a name that is taken", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null)
    expect(await saveKnowledgeSource({ ...KB, id: "gone" })).toMatchObject({ success: false, code: "NOT_FOUND" })

    prismaMock.knowledgeSource.findFirst.mockResolvedValue({ id: "other" } as never)
    expect(await saveKnowledgeSource(KB)).toMatchObject({ success: false, code: "CONFLICT" })
  })

  it("keeps the stored token when left blank and says when GitHub could not be read", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "k1", token: "ghp_old" } as never)
    prismaMock.knowledgeSource.update.mockResolvedValue({ ...KB, id: "k1" } as never)
    jest.mocked(listDocs).mockResolvedValue(null)

    const result = await saveKnowledgeSource({ ...KB, id: "k1" })

    expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: expect.objectContaining({ token: "ghp_old" }) })
    expect(result).toEqual({ success: true, data: { id: "k1", docCount: null } })
  })
})

describe("deleteKnowledgeSource", () => {
  it("reports a row that is already gone", async () => {
    prismaMock.knowledgeSource.deleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteKnowledgeSource({ id: "k1" })).toMatchObject({ success: false, code: "NOT_FOUND" })
  })

  it("deletes and audits", async () => {
    prismaMock.knowledgeSource.deleteMany.mockResolvedValue({ count: 1 })
    expect(await deleteKnowledgeSource({ id: "k1" })).toEqual({ success: true, data: null })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_SOURCE_CHANGED, "admin-1", { kind: "knowledge", action: "deleted", id: "k1" })
  })
})
