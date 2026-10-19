/**
 * Tests for configDiff (P4.6, SEC-55): the diff names what changed and never
 * carries a secret value or a URL path.
 */

import { configDiff } from "@/lib/security/config-diff"

const options = { secretFields: ["apiKey"], urlFields: ["url", "publicUrl"] }

describe("configDiff", () => {
  it("contains no secret value and no URL path, query or credentials", () => {
    const diff = configDiff(
      "tautulli",
      { name: "Old", url: "http://user:pw@old.lan:8181/private/path?token=abc", publicUrl: null, apiKey: "old-secret" },
      { name: "New", url: "https://new.lan/other/path?q=1", publicUrl: "https://t.example.com/x", apiKey: "new-secret" },
      options
    )

    const json = JSON.stringify(diff)
    for (const leaked of ["old-secret", "new-secret", "private", "path", "token", "abc", "pw@", "Old", "New"]) {
      expect(json).not.toContain(leaked)
    }
    expect(diff).toEqual({
      section: "tautulli",
      changedFields: ["name", "publicUrl", "url"],
      secretChanged: true,
      origins: {
        before: { url: "http://old.lan:8181", publicUrl: null },
        after: { url: "https://new.lan", publicUrl: "https://t.example.com" },
      },
    })
  })

  it("reports an unchanged secret and no changed fields for a same-value save", () => {
    const row = { name: "T", url: "http://t.lan:8181", publicUrl: null, apiKey: "k" }
    expect(configDiff("tautulli", row, { ...row, publicUrl: undefined }, options)).toMatchObject({
      changedFields: [],
      secretChanged: false,
    })
  })

  it("treats a secret left out of `after` as kept", () => {
    expect(
      configDiff("stripe", { stripeSecretKey: "sk_live_1" }, { stripeSecretKey: undefined }, { secretFields: ["stripeSecretKey"] })
        .secretChanged
    ).toBe(false)
  })

  it("counts every field of a first save as changed", () => {
    expect(configDiff("prometheus", null, { name: "P", url: "http://p:9090", query: "up" }, { urlFields: ["url"] })).toEqual({
      section: "prometheus",
      changedFields: ["name", "query", "url"],
      secretChanged: false,
      origins: { before: null, after: { url: "http://p:9090" } },
    })
  })

  it("records an unparseable or empty URL, and an opaque origin, as null", () => {
    expect(
      configDiff("x", null, { url: "not a url", publicUrl: "", baseUrl: "file:///etc/passwd" }, {
        urlFields: ["url", "publicUrl", "baseUrl"],
      }).origins.after
    ).toEqual({ url: null, publicUrl: null, baseUrl: null })
  })

  it("compares arrays by value", () => {
    expect(configDiff("stripe", { stripePriceIds: ["a", "b"] }, { stripePriceIds: ["a", "b"] }).changedFields).toEqual([])
    expect(configDiff("stripe", { stripePriceIds: ["a"] }, { stripePriceIds: ["a", "b"] }).changedFields).toEqual([
      "stripePriceIds",
    ])
  })
})
