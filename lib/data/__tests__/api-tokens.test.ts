/**
 * @jest-environment node
 */
import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { listOwnApiTokens } from "@/lib/data/api-tokens"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))

const NOW = new Date("2026-10-31T12:00:00Z")

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
})

it("lists the caller's own live tokens without their hashes", async () => {
  prismaMock.apiToken.findMany.mockResolvedValue([
    { id: "tok-1", name: "Laptop", prefix: "pmk_abcdef", scope: "read", createdAt: NOW, lastUsedAt: null, expiresAt: NOW },
  ] as never)

  await expect(listOwnApiTokens(NOW)).resolves.toEqual([
    { id: "tok-1", name: "Laptop", prefix: "pmk_abcdef", scope: "read", createdAt: NOW.toISOString(), lastUsedAt: null, expiresAt: NOW.toISOString() },
  ])
  const query = prismaMock.apiToken.findMany.mock.calls[0][0]
  expect(query?.where).toEqual({ userId: "admin-1", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] })
  expect(query?.select).not.toHaveProperty("tokenHash")
})

it("refuses anyone below admin", async () => {
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m-1", isAdmin: false }, expires: "" })
  await expect(listOwnApiTokens(NOW)).rejects.toMatchObject({ digest: expect.any(String) })
  expect(prismaMock.apiToken.findMany).not.toHaveBeenCalled()
})
