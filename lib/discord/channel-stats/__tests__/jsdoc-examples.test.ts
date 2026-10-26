import { formatChannelName } from "../format"

describe("JSDoc Documentation Examples", () => {
  it("matches formatChannelName", () => {
    expect(formatChannelName("{server} Status ({value})", { server: "MFlix", value: "🟢" })).toBe("MFlix Status (🟢)")
    expect(formatChannelName("Bandwidth: {value} Mbps", { server: "MFlix", value: "12.5" })).toBe("Bandwidth: 12.5 Mbps")
  })
})
