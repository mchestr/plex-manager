/**
 * Tests for the shared active Plex server config loader.
 */

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

const findFirstMock = prisma.plexServer.findFirst as jest.Mock

describe("getActivePlexServerConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("queries only the active Plex server", async () => {
    findFirstMock.mockResolvedValue(null)

    await getActivePlexServerConfig()

    expect(findFirstMock).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })
  })

  it("returns the mapped config when an active server exists", async () => {
    findFirstMock.mockResolvedValue({
      id: "plex-1",
      name: "My Plex",
      url: "http://localhost:32400",
      token: "test-token",
      publicUrl: "https://plex.example.com",
      adminPlexUserId: "admin-123",
      machineIdentifier: "machine-1",
      isActive: true,
    })

    const config = await getActivePlexServerConfig()

    expect(config).toEqual({
      name: "My Plex",
      url: "http://localhost:32400",
      token: "test-token",
      publicUrl: "https://plex.example.com",
      adminPlexUserId: "admin-123",
      machineIdentifier: "machine-1",
    })
  })

  it("maps a null publicUrl to undefined", async () => {
    findFirstMock.mockResolvedValue({
      id: "plex-1",
      name: "My Plex",
      url: "http://localhost:32400",
      token: "test-token",
      publicUrl: null,
      adminPlexUserId: null,
      isActive: true,
    })

    const config = await getActivePlexServerConfig()

    expect(config).toEqual({
      name: "My Plex",
      url: "http://localhost:32400",
      token: "test-token",
      publicUrl: undefined,
      adminPlexUserId: null,
      machineIdentifier: null,
    })
  })

  it("returns null when no active server exists", async () => {
    findFirstMock.mockResolvedValue(null)

    const config = await getActivePlexServerConfig()

    expect(config).toBeNull()
  })

  it("propagates errors from the database", async () => {
    findFirstMock.mockRejectedValue(new Error("Database error"))

    await expect(getActivePlexServerConfig()).rejects.toThrow("Database error")
  })
})
