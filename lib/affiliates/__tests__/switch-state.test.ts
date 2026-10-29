/** `affiliateSettingsFrom`: the switch reads as on only when it is on, has libraries and names the active server. */

import { affiliateSettingsFrom } from "@/lib/affiliates/switch-state"

const ON = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1, 2], affiliatePlexMachineId: "machine-1" }

describe("affiliateSettingsFrom", () => {
  it("is on with libraries on the server it was turned on for", () => {
    expect(affiliateSettingsFrom(ON, "machine-1")).toEqual({ on: true, librarySectionIds: [1, 2] })
  })

  it.each([
    ["turned off", { ...ON, affiliateInvitesEnabled: false }, "machine-1"],
    ["without libraries", { ...ON, affiliateLibrarySectionIds: [] }, "machine-1"],
    ["on another server", ON, "machine-2"],
    ["without a server", ON, null],
    ["without a stored server", { ...ON, affiliatePlexMachineId: null }, null],
  ])("is off %s", (_label, config, machine) => {
    expect(affiliateSettingsFrom(config, machine).on).toBe(false)
  })

  it("reads a malformed library list as none, and no config as off", () => {
    expect(affiliateSettingsFrom({ ...ON, affiliateLibrarySectionIds: "1,2" }, "machine-1")).toEqual({ on: false, librarySectionIds: [] })
    expect(affiliateSettingsFrom(null, "machine-1")).toEqual({ on: false, librarySectionIds: [] })
  })
})
