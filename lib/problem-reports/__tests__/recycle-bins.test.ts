/**
 * Members' swaps need a recycle bin in each of Radarr and Sonarr that is set
 * up; one that can't be read counts as having none.
 */

import { getArrMediaManagement } from "@/lib/connections/arr-swap"
import { getActiveService } from "@/lib/data/active-service"
import { servicesWithoutRecycleBin } from "@/lib/problem-reports/recycle-bins"

jest.mock("@/lib/connections/arr-swap", () => ({ getArrMediaManagement: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const row = (name: string) => ({ name, url: `http://${name.toLowerCase()}.local`, apiKey: "key" })

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => row(kind === "radarr" ? "Radarr" : "Sonarr")) as never)
})

it("names each service without a recycle bin, or that can't be read", async () => {
  jest.mocked(getArrMediaManagement).mockImplementation(async (service) =>
    service === "Radarr" ? { success: true, data: { recycleBin: false } } : { success: false, error: "down" }
  )

  await expect(servicesWithoutRecycleBin()).resolves.toEqual(["Radarr", "Sonarr"])
  expect(getArrMediaManagement).toHaveBeenCalledWith("Radarr", { url: "http://radarr.local", apiKey: "key" })
})

it("is empty when every service set up keeps a recycle bin, and skips one that isn't set up", async () => {
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "radarr" ? row("Radarr") : null)) as never)
  jest.mocked(getArrMediaManagement).mockResolvedValue({ success: true, data: { recycleBin: true } })

  await expect(servicesWithoutRecycleBin()).resolves.toEqual([])
  expect(getArrMediaManagement).toHaveBeenCalledTimes(1)
})
