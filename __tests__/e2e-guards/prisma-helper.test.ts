/**
 * @jest-environment node
 *
 * createE2EPrismaClient() is the client every E2E spec, fixture and the global
 * setup use, so it must refuse anything but the E2E test database on its own.
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { createE2EPrismaClient } from "../../e2e/helpers/prisma"

jest.mock("@prisma/adapter-pg", () => ({ PrismaPg: jest.fn() }))
jest.mock("@/lib/generated/prisma/client", () => ({ PrismaClient: jest.fn() }))

const MockPrismaPg = PrismaPg as unknown as jest.Mock
const MockPrismaClient = PrismaClient as unknown as jest.Mock

const TEST_URL = "postgresql://postgres:pw@localhost:5433/plex_manager_test?schema=public"
const DEV_URL = "postgresql://postgres:pw@localhost:5432/plex_wrapped?schema=public"

const env = process.env as Record<string, string | undefined>
const originalEnv = { ...process.env }

describe("createE2EPrismaClient", () => {
  beforeEach(() => {
    MockPrismaPg.mockClear()
    MockPrismaClient.mockClear()
    delete env.DATABASE_URL
    delete env.E2E_DATABASE_URL
  })

  afterAll(() => {
    process.env = originalEnv
  })

  function expectNoClient() {
    expect(MockPrismaPg).not.toHaveBeenCalled()
    expect(MockPrismaClient).not.toHaveBeenCalled()
  }

  it("refuses the development database even when both variables point at it", () => {
    env.DATABASE_URL = DEV_URL
    env.E2E_DATABASE_URL = DEV_URL

    expect(() => createE2EPrismaClient()).toThrow(/database "plex_wrapped".*must end in _test/)
    expectNoClient()
  })

  it("refuses when DATABASE_URL is unset", () => {
    env.E2E_DATABASE_URL = TEST_URL

    expect(() => createE2EPrismaClient()).toThrow(/no database URL is set/)
    expectNoClient()
  })

  it("refuses a _test DATABASE_URL that differs from E2E_DATABASE_URL", () => {
    env.DATABASE_URL = "postgresql://postgres:pw@localhost:5433/other_test"
    env.E2E_DATABASE_URL = TEST_URL

    expect(() => createE2EPrismaClient()).toThrow(/DATABASE_URL must equal E2E_DATABASE_URL/)
    expectNoClient()
  })

  it("refuses a _test DATABASE_URL when E2E_DATABASE_URL is unset", () => {
    env.DATABASE_URL = TEST_URL

    expect(() => createE2EPrismaClient()).toThrow(/DATABASE_URL must equal E2E_DATABASE_URL/)
    expectNoClient()
  })

  it("builds a client on the test database when the two URLs match", () => {
    env.DATABASE_URL = TEST_URL
    env.E2E_DATABASE_URL = TEST_URL

    const client = createE2EPrismaClient()

    expect(MockPrismaPg).toHaveBeenCalledWith({ connectionString: TEST_URL })
    expect(MockPrismaClient).toHaveBeenCalledWith({ adapter: MockPrismaPg.mock.instances[0] })
    expect(client).toBe(MockPrismaClient.mock.instances[0])
  })
})
