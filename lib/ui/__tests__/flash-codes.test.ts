import { readFlash, withFlash } from "@/lib/ui/flash-codes"

describe("withFlash", () => {
  it("adds the code to a bare path", () => {
    expect(withFlash("/discord/link", "discord_linked")).toBe("/discord/link?flash=discord_linked")
  })

  it("keeps the existing query, including a literal question mark in a value", () => {
    expect(withFlash("/discord/link?x=a?b", "discord_failed")).toBe("/discord/link?x=a%3Fb&flash=discord_failed")
  })

  it("replaces a flash the path already carries", () => {
    expect(withFlash("/?flash=other", "discord_expired")).toBe("/?flash=discord_expired")
  })
})

describe("readFlash", () => {
  const read = (query: string) => readFlash(new URLSearchParams(query))

  it.each([
    ["flash=discord_linked", "Discord linked", "success"],
    ["flash=discord_failed", "Discord wasn't linked", "error"],
    ["flash=discord_expired", "Discord wasn't linked", "error"],
    ["flash=discord_session_mismatch", "Discord wasn't linked", "error"],
    ["flash=discord_rate_limited", "Too many Discord link attempts", "error"],
    ["flash=discord_unavailable", "Discord linking is unavailable", "error"],
    ["status=linked", "Discord linked", "success"],
    ["error=CredentialsSignin", "Sign-in didn't work", "error"],
    ["error=AccessDenied", "You don't have access", "error"],
    ["error=Configuration", "Sign-in isn't working", "error"],
    ["error=Verification", "That sign-in expired", "error"],
    ["error=Default", "Sign-in didn't work", "error"],
  ])("%s shows %s", (query, title, tone) => {
    expect(read(query)?.toasts).toEqual([expect.objectContaining({ title, tone })])
  })

  it("names a linked Discord account in the title alone", () => {
    expect(read("flash=discord_linked")?.toasts[0]).toEqual({ title: "Discord linked", tone: "success" })
  })

  it("drops unknown values without copy, and strips them with error_description", () => {
    const result = read("flash=<b>hi</b>&error=Call 555&error_description=more&page=2")
    expect(result?.toasts).toEqual([])
    expect(result?.query.toString()).toBe("page=2")
  })

  it("leaves a status that is not a code, as /admin/queues filters on it", () => {
    expect(read("status=failed&jobType=x")).toBeNull()
    expect(read("flash=discord_linked&status=failed")?.query.toString()).toBe("status=failed")
  })

  it("shows one toast when the code and the legacy status agree", () => {
    expect(read("flash=discord_linked&status=linked")?.toasts).toHaveLength(1)
  })

  it("ignores inherited object keys", () => {
    expect(read("flash=constructor&error=toString")?.toasts).toEqual([])
  })
})
