/** `stopSyncAndClearPlexToken`: the sync stops, the token goes and the end of access is stamped, in one transaction. */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { stopSyncAndClearPlexToken } from "@/lib/members/offboard"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

it("stops the sync, clears the token and stamps accessEndedAt", async () => {
  await stopSyncAndClearPlexToken("member-1")

  expect(prismaMock.watchlistSyncSettings.updateMany).toHaveBeenCalledWith({ where: { userId: "member-1" }, data: { syncEnabled: false } })
  expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "member-1" }, data: { plexAuthToken: null, accessEndedAt: expect.any(Date) } })
  expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
})
