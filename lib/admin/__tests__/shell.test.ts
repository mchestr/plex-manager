/**
 * @jest-environment node
 */

/**
 * The admin shell's data (`getAdminShellData`): the nav items the user may
 * open, Assistant included for anyone holding `assistant:use` whether AI
 * features are on or off (its page says when nothing can be sent), and the
 * counts a role sees.
 */

import { getAdminShellData } from "@/lib/admin/shell"

jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/lib/admin/nav-counts", () => ({
  getAdminNavCounts: jest.fn().mockResolvedValue({ users: 7, activeInvites: 3, failedJobs: 0 }),
}))

const admin = { id: "admin-1", name: "Dana Whitfield", isAdmin: true }
const support = { id: "support-1", name: "Sam Rivera", isAdmin: false, role: "support" }
const member = { id: "member-1", name: "Ada", isAdmin: false, role: null }

it("lists Assistant for an admin and a Support user, and not for a member without assistant:use", async () => {
  expect((await getAdminShellData(admin)).navIds).toContain("assistant")
  expect((await getAdminShellData(support)).navIds).toEqual(["assistant", "users"])
  expect((await getAdminShellData(member)).navIds).toEqual([])
})

it("gives a role the member count only", async () => {
  expect((await getAdminShellData(support)).navCounts).toEqual({ users: 7, activeInvites: 0, failedJobs: null })
  expect((await getAdminShellData(admin)).navCounts).toEqual({ users: 7, activeInvites: 3, failedJobs: 0 })
})
