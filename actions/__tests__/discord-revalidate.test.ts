/**
 * @jest-environment node
 *
 * Saving the Discord integration refreshes the page it is edited on, Admin,
 * Discord, Settings (the section moved there from Settings, which no longer
 * shows it), and the link page members see.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), updateTag: jest.fn() }))
jest.mock("@/lib/discord/integration", () => ({ clearDiscordRoleForUser: jest.fn(), syncDiscordRoleConnection: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
  prismaMock.discordIntegration.upsert.mockResolvedValue({} as never)
})

describe("updateDiscordIntegrationSettings", () => {
  it("refreshes the Discord settings page and the member link page, and not Settings", async () => {
    await expect(updateDiscordIntegrationSettings({})).resolves.toEqual({ success: true, data: null })

    expect(revalidatePath).toHaveBeenCalledWith("/admin/discord/settings")
    expect(revalidatePath).toHaveBeenCalledWith("/discord/link")
    expect(revalidatePath).not.toHaveBeenCalledWith("/admin/settings")
  })
})
