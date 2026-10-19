/**
 * Importing Plex users runs one query for the users already imported, not one
 * per Plex user (BP-26), and still reports a failed create per user.
 */

import { importPlexUsers } from "@/actions/import-plex-users"
import { getAllPlexServerUsers } from "@/lib/connections/plex"
import type { PlexServerUser } from "@/lib/connections/plex-core"
import { mockReset } from "jest-mock-extended"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildUser } from "@/__tests__/helpers/factories"

jest.mock("@/lib/admin", () => ({
  requireAdmin: jest.fn().mockResolvedValue({ user: { id: "admin-1", isAdmin: true } }),
}))

jest.mock("@/lib/connections/plex", () => ({
  getAllPlexServerUsers: jest.fn(),
}))

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const mockGetAllPlexServerUsers = getAllPlexServerUsers as jest.Mock

function plexUsers(count: number): PlexServerUser[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `plex-${i}`,
    name: `Member ${i}`,
    email: `member${i}@example.com`,
    restricted: false,
    serverAdmin: false,
  }))
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.plexServer.findFirst.mockResolvedValue({
    id: "server-1",
    name: "Plex",
    url: "http://plex:32400",
    publicUrl: null,
    token: "token",
    adminPlexUserId: "plex-0",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

describe("importPlexUsers", () => {
  it("looks up 50 users with a single findMany", async () => {
    mockGetAllPlexServerUsers.mockResolvedValue({ success: true, data: plexUsers(50) })
    prismaMock.user.findMany.mockResolvedValue([buildUser({ plexUserId: "plex-3" }), buildUser({ plexUserId: "plex-7" })])
    prismaMock.user.create.mockResolvedValue(buildUser())

    const result = await importPlexUsers()

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { plexUserId: { in: plexUsers(50).map((user) => user.id) } },
      select: { plexUserId: true },
    })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.create).toHaveBeenCalledTimes(48)
    expect(result).toEqual({ success: true, imported: 48, skipped: 2, errors: [] })
  })

  it("creates each new user once, marking the server admin", async () => {
    mockGetAllPlexServerUsers.mockResolvedValue({ success: true, data: plexUsers(2) })
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.user.create.mockResolvedValue(buildUser())

    await importPlexUsers()

    expect(prismaMock.user.create).toHaveBeenNthCalledWith(1, {
      data: { plexUserId: "plex-0", name: "Member 0", email: "member0@example.com", image: null, isAdmin: true },
    })
    expect(prismaMock.user.create).toHaveBeenNthCalledWith(2, {
      data: { plexUserId: "plex-1", name: "Member 1", email: "member1@example.com", image: null, isAdmin: false },
    })
  })

  it("still reports an email collision for that user only", async () => {
    mockGetAllPlexServerUsers.mockResolvedValue({ success: true, data: plexUsers(3) })
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.user.create
      .mockResolvedValueOnce(buildUser())
      .mockRejectedValueOnce(new Error("Unique constraint failed on the fields: (`email`)"))
      .mockResolvedValueOnce(buildUser())

    const result = await importPlexUsers()

    expect(result).toEqual({
      success: true,
      imported: 2,
      skipped: 0,
      errors: ["Member 1 (plex-1): Unique constraint failed on the fields: (`email`)"],
    })
  })
})
