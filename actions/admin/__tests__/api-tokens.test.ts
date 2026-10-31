/**
 * @jest-environment node
 */

/** Personal API tokens: admins only, the hash stored and the token returned once, ten live at most, own tokens revoked only. */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { createApiToken, revokeApiToken } from "@/actions/admin/api-tokens"
import { hashToken } from "@/lib/mcp/tokens"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const NOW = new Date("2026-10-31T12:00:00Z")

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] })
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  prismaMock.apiToken.count.mockResolvedValue(0)
  prismaMock.apiToken.create.mockResolvedValue({ id: "tok-1" } as never)
})

afterEach(() => jest.useRealTimers())

describe("createApiToken", () => {
  it("stores the hash, returns the token once and audits without it", async () => {
    const result = await createApiToken({ name: " Laptop ", expiresIn: "30d" })

    expect(result).toMatchObject({ success: true, data: { id: "tok-1" } })
    const { token } = (result as { data: { token: string } }).data
    expect(token).toMatch(/^pmk_[A-Za-z0-9_-]{43}$/)
    expect(prismaMock.apiToken.create).toHaveBeenCalledWith({
      data: {
        userId: "admin-1",
        name: "Laptop",
        tokenHash: hashToken(token),
        prefix: token.slice(0, 10),
        scope: "full",
        expiresAt: new Date("2026-11-30T12:00:00Z"),
      },
      select: { id: true },
    })
    expect(JSON.stringify(prismaMock.apiToken.create.mock.calls)).not.toContain(token)
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.API_TOKEN_CREATED, "admin-1", { credentialId: "tok-1", expiresIn: "30d", scope: "full" })
    expect(consume).toHaveBeenCalledWith("admin:api-tokens", "admin-1")
  })

  it("makes a read-only token when asked, and audits its scope", async () => {
    await createApiToken({ name: "Lookups", scope: "read" })
    expect(prismaMock.apiToken.create.mock.calls[0][0].data.scope).toBe("read")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.API_TOKEN_CREATED, "admin-1", expect.objectContaining({ scope: "read" }))
  })

  it("refuses an unknown scope", async () => {
    await expect(createApiToken({ name: "x", scope: "admin" as never })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.apiToken.create).not.toHaveBeenCalled()
  })

  it("lasts 90 days by default and forever when asked", async () => {
    await createApiToken({ name: "a" })
    expect(prismaMock.apiToken.create.mock.calls[0][0].data.expiresAt).toEqual(new Date("2027-01-29T12:00:00Z"))
    await createApiToken({ name: "b", expiresIn: "never" })
    expect(prismaMock.apiToken.create.mock.calls[1][0].data.expiresAt).toBeNull()
  })

  it("refuses an eleventh live token", async () => {
    prismaMock.apiToken.count.mockResolvedValue(10)
    await expect(createApiToken({ name: "x" })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
    expect(prismaMock.apiToken.create).not.toHaveBeenCalled()
  })

  it("refuses a blank name", async () => {
    await expect(createApiToken({ name: "  " })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
  })

  it("refuses anyone below admin", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" })
    await expect(createApiToken({ name: "x" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.apiToken.create).not.toHaveBeenCalled()
  })
})

describe("revokeApiToken", () => {
  it("revokes only the caller's own live token", async () => {
    prismaMock.apiToken.updateMany.mockResolvedValue({ count: 1 })

    await expect(revokeApiToken({ tokenId: "tok-1" })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.apiToken.updateMany).toHaveBeenCalledWith({
      where: { id: "tok-1", userId: "admin-1", revokedAt: null },
      data: { revokedAt: NOW },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.API_TOKEN_REVOKED, "admin-1", { credentialId: "tok-1" })
  })

  it("reads someone else's or a revoked token as not found", async () => {
    prismaMock.apiToken.updateMany.mockResolvedValue({ count: 0 })
    await expect(revokeApiToken({ tokenId: "tok-2" })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
