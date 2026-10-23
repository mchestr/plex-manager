/**
 * @jest-environment node
 *
 * reencryptStoredSecrets (P11.1): admin only; a dry run counts without an
 * audit row, the run is audited as SECRETS_REENCRYPTED, and no key is a
 * coded failure.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { reencryptStoredSecrets } from "@/actions/admin/encryption"
import { reencryptSecrets, type ReencryptResult } from "@/lib/security/reencrypt"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/reencrypt", () => ({ reencryptSecrets: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const totals = { values: 9, plaintext: 4, otherKid: 2, unreadable: 1, rewritten: 0 }
const result = (overrides: Partial<Extract<ReencryptResult, { ok: true }>> = {}): ReencryptResult => ({
  ok: true,
  dryRun: true,
  primaryKid: "k2",
  fields: {},
  totals,
  aborted: false,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(reencryptSecrets).mockResolvedValue(result())
})

describe("reencryptStoredSecrets", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })
    await expect(reencryptStoredSecrets({ dryRun: true })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(reencryptSecrets).not.toHaveBeenCalled()
  })

  it("counts in a dry run without auditing", async () => {
    await expect(reencryptStoredSecrets({ dryRun: true })).resolves.toEqual({
      success: true,
      data: { dryRun: true, primaryKid: "k2", plaintext: 4, otherKid: 2, unreadable: 1, rewritten: 0 },
    })
    expect(reencryptSecrets).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("runs, audits SECRETS_REENCRYPTED with the counts and revalidates settings", async () => {
    jest.mocked(reencryptSecrets).mockResolvedValue(result({ dryRun: false, totals: { ...totals, rewritten: 6 } }))

    await expect(reencryptStoredSecrets({ dryRun: false })).resolves.toMatchObject({ success: true, data: { rewritten: 6 } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SECRETS_REENCRYPTED, "admin-1", {
      kid: "k2",
      rewritten: 6,
      unreadable: 1,
      aborted: false,
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("answers CONFLICT without a key", async () => {
    jest.mocked(reencryptSecrets).mockResolvedValue({ ok: false, code: "NO_KEY" })
    await expect(reencryptStoredSecrets({ dryRun: false })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("maps a database failure to INTERNAL without its text", async () => {
    jest.mocked(reencryptSecrets).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"))
    await expect(reencryptStoredSecrets({ dryRun: false })).resolves.toMatchObject({
      success: false,
      code: "INTERNAL",
      error: "Could not encrypt the stored secrets",
    })
  })
})
