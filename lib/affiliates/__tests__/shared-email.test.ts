/** `plexEmailIsShared`: the live Plex email against the other accounts, ignoring case. */

import { mockReset } from "jest-mock-extended"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { plexEmailIsShared } from "@/lib/affiliates/shared-email"
import { getPlexUserInfo } from "@/lib/connections/plex"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex", () => ({ getPlexUserInfo: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexAuthToken: "member-token" }))
  jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: "42", username: "sam", email: "Sam@Example.com" } })
  prismaMock.user.findFirst.mockResolvedValue(null)
})

describe("plexEmailIsShared", () => {
  it("is true when another account has the Plex email, in any case", async () => {
    prismaMock.user.findFirst.mockResolvedValue(buildUser({ id: "other" }))
    await expect(plexEmailIsShared("user-1")).resolves.toBe(true)
    expect(getPlexUserInfo).toHaveBeenCalledWith("member-token")
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: { not: "user-1" }, email: { equals: "Sam@Example.com", mode: "insensitive" } },
      select: { id: true },
    })
  })

  it("is false when no other account has it", async () => {
    await expect(plexEmailIsShared("user-1")).resolves.toBe(false)
  })

  it("is false without a stored token, or when plex.tv does not answer", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(buildUser({ plexAuthToken: null }))
    await expect(plexEmailIsShared("user-1")).resolves.toBe(false)
    expect(getPlexUserInfo).not.toHaveBeenCalled()

    jest.mocked(getPlexUserInfo).mockResolvedValue({ success: false, error: "down" })
    await expect(plexEmailIsShared("user-1")).resolves.toBe(false)
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
  })
})
