import { maskIp, sanitizeText } from "@/lib/utils/log-redaction"

describe("JSDoc Documentation Examples", () => {
  it("log-redaction: masks a share path, an OAuth code and an IP", () => {
    expect(sanitizeText("GET /rewind/s/abc123?year=2026&code=xyz")).toBe(
      "GET /rewind/s/[masked]?year=2026&code=[REDACTED]"
    )
    expect(maskIp("203.0.113.7")).toBe("203.0.113.0/24")
  })
})
