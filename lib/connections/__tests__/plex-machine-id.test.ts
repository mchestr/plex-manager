/**
 * @jest-environment node
 */

/**
 * `withMachineIdentifier` fills `PlexServer.machineIdentifier` lazily on the
 * first identity call, and never asks the PMS again once it is stored.
 */

import { mockReset } from "jest-mock-extended"

import { buildPlexServer } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

let fetchSpy: jest.SpyInstance

beforeEach(() => {
  mockReset(prismaMock)
  fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response('<MediaContainer size="0" machineIdentifier="abc123machine"/>', { status: 200 }))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("withMachineIdentifier", () => {
  it("returns a stored identifier without asking the PMS", async () => {
    const server = buildPlexServer({ machineIdentifier: "stored-id" })

    await expect(withMachineIdentifier(server)).resolves.toBe(server)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(prismaMock.plexServer.update).not.toHaveBeenCalled()
  })

  it("asks the PMS once and stores the answer", async () => {
    const server = buildPlexServer({ id: "plex-1" })

    await expect(withMachineIdentifier(server)).resolves.toEqual({ ...server, machineIdentifier: "abc123machine" })
    expect(prismaMock.plexServer.update).toHaveBeenCalledWith({
      where: { id: "plex-1" },
      data: { machineIdentifier: "abc123machine" },
    })
  })

  it("returns the row unchanged, and stores nothing, when the PMS is down", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 503 }))
    const server = buildPlexServer()

    await expect(withMachineIdentifier(server)).resolves.toBe(server)
    expect(prismaMock.plexServer.update).not.toHaveBeenCalled()
  })
})
