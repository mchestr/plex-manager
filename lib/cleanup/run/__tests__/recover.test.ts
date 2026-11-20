/**
 * @jest-environment node
 */

/**
 * Recovery of `deleting` items after a crash (TS 8.8 step 2, 8.12,
 * safety-r2-7): back to the previous state, or to `leaving` with the
 * approval cleared for Resume and Feature on.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

import { mockReset } from "jest-mock-extended"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { recoverDeleting } from "@/lib/cleanup/run/recover"

const tx = asAppTransactionClient(prismaMock)

beforeEach(() => mockReset(prismaMock))

describe("recoverDeleting", () => {
  it("moves an item with an approval back to approved and the others back to leaving (clearApproval: false)", async () => {
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 3 })

    await expect(recoverDeleting(tx, { clearApproval: false })).resolves.toBe(5)

    expect(prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { state: "deleting", approvedAt: { not: null } }, data: { state: "approved" } },
      { where: { state: "deleting", approvedAt: null }, data: { state: "leaving" } },
    ])
  })

  it("moves every recovered item to leaving with the approval cleared for Resume and Feature on (clearApproval: true)", async () => {
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 4 })

    await expect(recoverDeleting(tx, { clearApproval: true })).resolves.toBe(4)

    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({
      where: { state: "deleting" }, data: { state: "leaving", approvedAt: null, approvedBy: null },
    })
  })

  it("changes nothing when no item is in deleting", async () => {
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 0 })
    await expect(recoverDeleting(tx, { clearApproval: false })).resolves.toBe(0)
  })
})
