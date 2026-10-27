/**
 * getSettingsAuditMeta (P10.20, SEC-55): each settings section's last audited
 * save and who made it, from the persisted audit log.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const SAVED_AT = new Date("2027-01-18T10:00:00Z")

beforeEach(() => {
  mockReset(prismaMock)
  // The batched lookups resolve in order, one per section
  prismaMock.$transaction.mockImplementation((async (queries: unknown[]) => Promise.all(queries)) as never)
  prismaMock.auditLog.findFirst.mockResolvedValue(null)
})

type FindFirstArgs = { where: { type: { in: string[] }; OR: { details: { path: string[]; equals: string } }[] } }

const sectionsOf = (args: FindFirstArgs) => args.where.OR.map((clause) => clause.details.equals)

describe("getSettingsAuditMeta", () => {
  it("reads the newest save per section and names who made it", async () => {
    prismaMock.auditLog.findFirst.mockImplementation(((args: FindFirstArgs) =>
      Promise.resolve(sectionsOf(args).includes("tautulli") ? { actorUserId: "u1", createdAt: SAVED_AT } : null)) as never)
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", name: "Dana Whitfield", email: "dana@example.com" }] as never)

    const meta = await getSettingsAuditMeta()

    expect(meta.tautulli).toEqual({ at: SAVED_AT, by: "Dana Whitfield" })
    expect(meta.plex).toBeNull()
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["u1"] } }, select: { id: true, name: true, email: true } })
  })

  it("groups the audit sections of each settings section, newest first, as one batch", async () => {
    await getSettingsAuditMeta()

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    const calls = prismaMock.auditLog.findFirst.mock.calls.map(([args]) => args as unknown as FindFirstArgs)
    expect(calls.map(sectionsOf)).toEqual(
      expect.arrayContaining([
        ["llm", "llm.chat", "llm.wrapped", "llm.caps"],
        ["discord"],
        ["stripe", "stripe.enabled"],
        ["sonarr", "radarr", "jellyfin", "jellyfin.login"],
        ["appearance", "timezone"],
      ])
    )
    expect(calls[0].where.type.in).toEqual(["CONFIG_CHANGED", "DISCORD_INTEGRATION_CONFIG_CHANGED", "SERVER_TIMEZONE_CHANGED"])
    expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" } }))
    // Nobody saved anything, so no user lookup
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("falls back to the email, then to 'an admin' for a deleted user", async () => {
    prismaMock.auditLog.findFirst.mockImplementation(((args: FindFirstArgs) => {
      const sections = sectionsOf(args)
      if (sections.includes("plex")) return Promise.resolve({ actorUserId: "u2", createdAt: SAVED_AT })
      if (sections.includes("rewind")) return Promise.resolve({ actorUserId: "gone", createdAt: SAVED_AT })
      return Promise.resolve(null)
    }) as never)
    prismaMock.user.findMany.mockResolvedValue([{ id: "u2", name: null, email: "ops@example.com" }] as never)

    const meta = await getSettingsAuditMeta()

    expect(meta.plex?.by).toBe("ops@example.com")
    expect(meta.rewind?.by).toBe("an admin")
  })
})
