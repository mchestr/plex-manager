/**
 * @jest-environment node
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { listDocs, readDoc } from "@/lib/chatbot/knowledge/github"
import { logAuditEvent } from "@/lib/security/audit-log"

import { executeKnowledgeTool } from "../knowledge"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ AuditEventType: { ASSISTANT_DATA_READ: "ASSISTANT_DATA_READ" }, logAuditEvent: jest.fn() }))
jest.mock("@/lib/chatbot/knowledge/github", () => ({
  ...jest.requireActual("@/lib/chatbot/knowledge/github"),
  listDocs: jest.fn(),
  readDoc: jest.fn(),
}))

const KB = { id: "k1", name: "Runbooks", repo: "mchestr/knowledgebase", ref: "main", path: "", token: null, isActive: true, updatedAt: new Date() }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({} as never)
  prismaMock.knowledgeSource.findMany.mockResolvedValue([KB] as never)
})

describe("search_knowledge_base", () => {
  it("returns the best documents with a url to cite", async () => {
    jest.mocked(listDocs).mockResolvedValue(["rewind/failed.md", "plex/restart.md"])
    jest.mocked(readDoc).mockImplementation(async (_kb, path) =>
      path === "rewind/failed.md" ? "# Rewind failed\nCheck the queue when a Rewind fails." : "# Restart Plex\nunrelated"
    )

    const out = JSON.parse(await executeKnowledgeTool("search_knowledge_base", { query: "rewind failed" }, "admin-1"))

    expect(out.results).toHaveLength(1)
    expect(out.results[0]).toMatchObject({
      source: "Runbooks",
      path: "rewind/failed.md",
      title: "Rewind failed",
      url: "https://github.com/mchestr/knowledgebase/blob/main/rewind/failed.md",
    })
    expect(logAuditEvent).toHaveBeenCalledWith("ASSISTANT_DATA_READ", "admin-1", { toolName: "search_knowledge_base" })
  })

  it("says so when no knowledge base is configured", async () => {
    prismaMock.knowledgeSource.findMany.mockResolvedValue([])
    expect(await executeKnowledgeTool("search_knowledge_base", { query: "rewind" }, "a")).toContain("No knowledge base is configured")
  })

  it("rejects a malformed query", async () => {
    expect(await executeKnowledgeTool("search_knowledge_base", { query: "" }, "a")).toBe("Error: Invalid tool arguments")
  })

  it("requires an admin", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))
    await expect(executeKnowledgeTool("search_knowledge_base", { query: "rewind" }, "m")).rejects.toThrow("PM_FORBIDDEN")
    expect(prismaMock.knowledgeSource.findMany).not.toHaveBeenCalled()
  })
})

describe("read_knowledge_doc", () => {
  it("returns the document, cut to a limit", async () => {
    jest.mocked(readDoc).mockResolvedValue("x".repeat(20_000))
    const out = JSON.parse(await executeKnowledgeTool("read_knowledge_doc", { source: "Runbooks", path: "a.md" }, "a"))
    expect(out.content).toHaveLength(12_000)
    expect(out.truncated).toBe(true)
  })

  it("reports a missing document or source without detail", async () => {
    jest.mocked(readDoc).mockResolvedValue(null)
    expect(await executeKnowledgeTool("read_knowledge_doc", { source: "Runbooks", path: "nope.md" }, "a")).toContain("not found")
    expect(await executeKnowledgeTool("read_knowledge_doc", { source: "Other", path: "a.md" }, "a")).toContain("not found")
  })
})
