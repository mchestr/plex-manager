/**
 * @jest-environment node
 */
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getHelpData, type HelpData } from "@/lib/member/help"
import { getOnboardingData } from "@/lib/member/onboarding"

jest.mock("server-only", () => ({}))
jest.mock("@/lib/member/help", () => ({ getHelpData: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const HELP: HelpData = {
  service: "jellyfin",
  serverName: "Basement Media",
  requestsUrl: null,
  discord: null,
  instructions: null,
}

describe("getOnboardingData", () => {
  beforeEach(() => {
    mockReset(prismaMock)
    jest.mocked(getHelpData).mockResolvedValue(HELP)
  })

  it("adds the Rewind switch to the Help guides' props", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true }))

    await expect(getOnboardingData("member-1")).resolves.toEqual({ ...HELP, rewind: true })
    expect(getHelpData).toHaveBeenCalledWith("member-1")
  })

  it("treats a missing Config row as Rewind off", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)

    await expect(getOnboardingData("member-1")).resolves.toMatchObject({ rewind: false })
  })
})
