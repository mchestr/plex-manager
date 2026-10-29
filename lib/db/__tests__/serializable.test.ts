/** `inSerializable`: a Serializable transaction, retried on P2034 only. */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { inSerializable, isTransactionConflict } from "@/lib/db/serializable"
import { Prisma } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const conflict = () => new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "7" })

beforeEach(() => {
  mockReset(prismaMock)
  jest.spyOn(Math, "random").mockReturnValue(0)
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  for (let i = 0; i < 10; i++) await jest.advanceTimersByTimeAsync(1000)
  return promise
}

describe("inSerializable", () => {
  it("runs the body at Serializable isolation", async () => {
    prismaMock.$transaction.mockResolvedValue("done")
    await expect(inSerializable(async () => "done")).resolves.toBe("done")
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it("retries a conflict and tells onConflict the attempt", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(conflict()).mockResolvedValueOnce("second")
    const onConflict = jest.fn()
    await expect(settle(inSerializable(async () => "x", { onConflict }))).resolves.toBe("second")
    expect(onConflict).toHaveBeenCalledWith(1)
  })

  it("throws a conflict that outlasts three retries", async () => {
    prismaMock.$transaction.mockRejectedValue(conflict())
    const result = settle(inSerializable(async () => "x").catch((error: unknown) => error))
    expect(isTransactionConflict(await result)).toBe(true)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(4)
  })

  it("throws any other error at once", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("boom"))
    await expect(inSerializable(async () => "x")).rejects.toThrow("boom")
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe("isTransactionConflict", () => {
  it("is true for P2034 only", () => {
    expect(isTransactionConflict(conflict())).toBe(true)
    expect(isTransactionConflict(new Prisma.PrismaClientKnownRequestError("x", { code: "P2002", clientVersion: "7" }))).toBe(false)
    expect(isTransactionConflict(new Error("x"))).toBe(false)
  })
})
