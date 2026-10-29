/**
 * @jest-environment node
 */

/** Saving the affiliate settings: admins only, rate limited, validated, and a refused switch reads as VALIDATION. */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { updateAffiliateSettings } from "@/actions/admin/affiliate-settings"
import { saveAffiliateSettings } from "@/lib/affiliates/switch"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/affiliates/switch", () => ({ saveAffiliateSettings: jest.fn() }))

const input = { enabled: true, tiers: [{ overHours: 50, invites: 1 }], cap: null, libraryIds: [1] }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(saveAffiliateSettings).mockResolvedValue({ ok: true, invitesCancelled: 2 })
})

it("saves, returns the cancelled count and refreshes the page", async () => {
  await expect(updateAffiliateSettings(input)).resolves.toEqual({ success: true, data: { invitesCancelled: 2 } })
  expect(saveAffiliateSettings).toHaveBeenCalledWith(input, "admin-1")
  expect(consume).toHaveBeenCalledWith("admin:affiliates", expect.anything())
  expect(revalidatePath).toHaveBeenCalledWith("/admin/affiliates")
})

it("refuses Support", async () => {
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" })
  await expect(updateAffiliateSettings(input)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
  expect(saveAffiliateSettings).not.toHaveBeenCalled()
})

it("refuses the switch on without libraries before it saves", async () => {
  const result = await updateAffiliateSettings({ ...input, libraryIds: [] })
  expect(result).toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { libraryIds: [expect.any(String)] } })
  expect(saveAffiliateSettings).not.toHaveBeenCalled()
})

it("returns a refused precondition as VALIDATION with its copy", async () => {
  jest.mocked(saveAffiliateSettings).mockResolvedValue({ ok: false, reason: "Connect Tautulli first." })
  await expect(updateAffiliateSettings(input)).resolves.toEqual({ success: false, code: "VALIDATION", error: "Connect Tautulli first." })
  expect(revalidatePath).not.toHaveBeenCalled()
})
