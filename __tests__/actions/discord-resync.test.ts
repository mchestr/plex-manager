/**
 * resyncDiscordRole (P4.20): the web "Force resync" button is limited to
 * three a member an hour, under the `discord:resync` limit.
 */

import { getServerSession } from "next-auth"

import { resyncDiscordRole } from "@/actions/discord"
import { getAccessLevel } from "@/lib/access"
import { syncDiscordRoleConnection } from "@/lib/discord/integration"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/access", () => ({ getAccessLevel: jest.fn() }))
jest.mock("@/lib/discord/integration", () => ({
  syncDiscordRoleConnection: jest.fn(),
  clearDiscordRoleForUser: jest.fn(),
}))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

function signIn(userId: string) {
  jest.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, name: "Member", email: "m@example.com", isAdmin: false },
    expires: "2099-01-01T00:00:00.000Z",
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAccessLevel).mockResolvedValue("full")
  jest.mocked(syncDiscordRoleConnection).mockResolvedValue(undefined)
})

describe("resyncDiscordRole", () => {
  it("refuses the fourth resync in an hour without syncing", async () => {
    signIn("resync-member")

    for (let i = 0; i < 3; i++) {
      expect(await resyncDiscordRole()).toEqual({ success: true, data: null })
    }
    const refused = await resyncDiscordRole()

    expect(refused).toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(refused.success === false && refused.retryAfterSec).toBeGreaterThan(0)
    expect(syncDiscordRoleConnection).toHaveBeenCalledTimes(3)
  })

  it("counts each member separately", async () => {
    signIn("member-a")
    for (let i = 0; i < 3; i++) await resyncDiscordRole()

    signIn("member-b")
    expect((await resyncDiscordRole()).success).toBe(true)
  })
})
