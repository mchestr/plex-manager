import { z } from "zod"

import { getAssistantFailedJobs, getAssistantInvites, getAssistantMember } from "@/lib/data/assistant-data"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

import { executeAppDataTool } from "../app-data"

jest.mock("@/lib/data/assistant-data", () => ({
  getAssistantInvites: jest.fn(),
  getAssistantMember: jest.fn(),
  getAssistantFailedJobs: jest.fn(),
}))
jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: { ASSISTANT_DATA_READ: "ASSISTANT_DATA_READ" },
  logAuditEvent: jest.fn(),
}))

describe("executeAppDataTool", () => {
  beforeEach(() => jest.clearAllMocks())

  it("returns dates in the turn's zone and audits the call by tool name only", async () => {
    jest.mocked(getAssistantInvites).mockResolvedValue({
      count: 1,
      invites: [
        {
          id: "i1",
          codeEnd: "abc",
          serverType: "PLEX",
          maxUses: 1,
          useCount: 0,
          expiresAt: new Date("2026-11-01T00:00:00Z"),
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
    })

    const out = JSON.parse(
      await executeAppDataTool("get_app_invites", { expiresWithinDays: 7 }, "admin-1", "default", {
        timeZone: "America/Los_Angeles",
        locale: "en-US",
      })
    )

    expect(getAssistantInvites).toHaveBeenCalledWith({ expiresWithinDays: 7 })
    expect(out.invites[0].expiresAt).toBe("2026-10-31T17:00:00-07:00")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_DATA_READ, "admin-1", {
      toolName: "get_app_invites",
    })
  })

  it("dispatches the member and failed job tools", async () => {
    jest.mocked(getAssistantMember).mockResolvedValue({ found: false })
    jest.mocked(getAssistantFailedJobs).mockResolvedValue({ redisConfigured: false, total: 0, jobs: [] })

    expect(JSON.parse(await executeAppDataTool("get_app_member", { query: "sam" }, "a"))).toEqual({ found: false })
    expect(getAssistantMember).toHaveBeenCalledWith({ query: "sam" })
    expect(JSON.parse(await executeAppDataTool("get_app_failed_jobs", {}, "a")).total).toBe(0)
  })

  it("audits before the read and turns invalid arguments into a plain error", async () => {
    jest.mocked(getAssistantMember).mockImplementation(() => z.object({ query: z.string().min(2) }).parseAsync({ query: "a" }) as never)

    expect(await executeAppDataTool("get_app_member", { query: "a" }, "admin-1")).toBe("Error: Invalid tool arguments")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ASSISTANT_DATA_READ, "admin-1", { toolName: "get_app_member" })
  })

  it("does not audit an unknown tool", async () => {
    expect(await executeAppDataTool("nope", {}, "a")).toBe("Error: Unknown tool")
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
