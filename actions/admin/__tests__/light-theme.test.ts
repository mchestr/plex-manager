/**
 * @jest-environment node
 *
 * setLightThemeEnabled (P10.10): admin only, saves Config.lightThemeEnabled,
 * audits CONFIG_CHANGED and revalidates the cached app settings.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath, updateTag } from "next/cache"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { setLightThemeEnabled } from "@/actions/admin/light-theme"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), updateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ lightThemeEnabled: false }))
  prismaMock.config.upsert.mockResolvedValue(buildConfig({ lightThemeEnabled: true }))
})

describe("setLightThemeEnabled", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })

    await expect(setLightThemeEnabled({ enabled: true })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("saves the flag, audits the change and revalidates the app settings", async () => {
    await expect(setLightThemeEnabled({ enabled: true })).resolves.toEqual({ success: true, data: { enabled: true } })

    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lightThemeEnabled: true, updatedBy: "admin-1" } })
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      "admin-1",
      expect.objectContaining({ section: "appearance", changedFields: expect.arrayContaining(["lightThemeEnabled"]) })
    )
    expect(updateTag).toHaveBeenCalledWith("app-settings")
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("refuses a value that is not a boolean", async () => {
    const send = setLightThemeEnabled as (input: unknown) => ReturnType<typeof setLightThemeEnabled>

    await expect(send({ enabled: "yes" })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })
})
