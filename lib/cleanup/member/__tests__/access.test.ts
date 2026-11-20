/**
 * @jest-environment node
 */

/**
 * `memberCleanupAccess` and `canSeeItem` (TS 13.1): the owner sees all, a
 * section with no filter shows every title, a `label!=` filter hides the
 * titles with those labels and only counts in `labelsRead` sections, any
 * other filter form hides the section, and a plex.tv failure gives null.
 * `parseLabelFilter` follows the six parse rules of 13.1 rule 3.
 */

import { canSeeItem, memberCleanupAccess, type MemberCleanupAccess } from "@/lib/cleanup/member/access"
import { parseLabelFilter } from "@/lib/cleanup/member/label-filter"
import { getSharedSectionFilters, type SharedSectionFilters } from "@/lib/connections/plex-shared-sections"

jest.mock("@/lib/connections/plex-shared-sections", () => ({ getSharedSectionFilters: jest.fn() }))

const filtersMock = jest.mocked(getSharedSectionFilters)

const SERVER = { url: "http://plex.invalid:32400", token: "token", adminPlexUserId: "900001" }
const MEMBER = "900101"
const READ = new Set(["1", "2"])

const share = (entries: Record<string, string | null>): SharedSectionFilters => new Map(Object.entries(entries))

async function accessWith(entries: Record<string, string | null>): Promise<MemberCleanupAccess> {
  filtersMock.mockResolvedValueOnce(share(entries))
  const access = await memberCleanupAccess(SERVER, MEMBER, { timeoutMs: 1500 })
  if (access === null) throw new Error("expected an answer")
  return access
}

beforeEach(() => filtersMock.mockReset())

describe("memberCleanupAccess", () => {
  it("gives the owner every library with no plex.tv call", async () => {
    await expect(memberCleanupAccess(SERVER, "900001", { timeoutMs: 300 })).resolves.toBe("all")
    expect(filtersMock).not.toHaveBeenCalled()
  })

  it("passes the caller's budget to the share list and keeps an all-libraries share", async () => {
    filtersMock.mockResolvedValueOnce("all")
    await expect(memberCleanupAccess(SERVER, MEMBER, { timeoutMs: 300 })).resolves.toBe("all")
    expect(filtersMock).toHaveBeenCalledWith(SERVER, MEMBER, { timeoutMs: 300 })
  })

  it("gives null when plex.tv failed or answered late", async () => {
    filtersMock.mockResolvedValueOnce(null)
    await expect(memberCleanupAccess(SERVER, MEMBER, { timeoutMs: 1500 })).resolves.toBeNull()
  })

  it("treats a server with no stored owner as a member lookup", async () => {
    filtersMock.mockResolvedValueOnce(share({ "1": null }))
    await expect(memberCleanupAccess({ ...SERVER, adminPlexUserId: null }, "900001", { timeoutMs: 1500 })).resolves.toEqual(share({ "1": null }))
  })

  it("keeps a section with no filter and one with a label filter, and drops any other form", async () => {
    const access = await accessWith({ "1": null, "2": "label!=Untranscodable", "3": "contentRating=PG", "4": "label!=A|contentRating=PG" })
    expect(access).toEqual(new Map([["1", null], ["2", new Set(["untranscodable"])]]))
  })

  it("gives an empty map to a member with no share", async () => {
    await expect(accessWith({})).resolves.toEqual(new Map())
  })
})

describe("canSeeItem", () => {
  it("shows every title to the owner", () => {
    expect(canSeeItem("all", { sectionId: "9", labels: null }, new Set())).toBe(true)
  })

  it("shows every title of a section with no filter, labels known or not", async () => {
    const access = await accessWith({ "1": null })
    expect(canSeeItem(access, { sectionId: "1", labels: ["untranscodable"] }, READ)).toBe(true)
    expect(canSeeItem(access, { sectionId: "1", labels: null }, new Set())).toBe(true)
  })

  it("hides a section that is not shared, and one with another filter form", async () => {
    const access = await accessWith({ "1": null, "2": "contentRating=PG" })
    expect(canSeeItem(access, { sectionId: "3", labels: [] }, READ)).toBe(false)
    expect(canSeeItem(access, { sectionId: "2", labels: [] }, READ)).toBe(false)
  })

  it('with filterMovies="label!=Untranscodable" shows a movie without that label and not one with it', async () => {
    const access = await accessWith({ "1": "label!=Untranscodable" })
    expect(canSeeItem(access, { sectionId: "1", labels: ["4k"] }, READ)).toBe(true)
    expect(canSeeItem(access, { sectionId: "1", labels: ["untranscodable", "4k"] }, READ)).toBe(false)
  })

  it("passes and fails a label filter with two labels", async () => {
    const access = await accessWith({ "1": "label!=A%2CB" })
    expect(canSeeItem(access, { sectionId: "1", labels: ["c"] }, READ)).toBe(true)
    expect(canSeeItem(access, { sectionId: "1", labels: ["b"] }, READ)).toBe(false)
  })

  it("compares a mixed-case stored label without case", async () => {
    const access = await accessWith({ "1": "label!=Untranscodable" })
    expect(canSeeItem(access, { sectionId: "1", labels: ["UnTranscodable"] }, READ)).toBe(false)
  })

  it("hides a label-filtered section that is missing from labelsRead", async () => {
    const access = await accessWith({ "5": "label!=Untranscodable" })
    expect(canSeeItem(access, { sectionId: "5", labels: [] }, READ)).toBe(false)
  })

  it("hides a title whose labels are not known under a label filter", async () => {
    const access = await accessWith({ "1": "label!=Untranscodable" })
    expect(canSeeItem(access, { sectionId: "1", labels: null }, READ)).toBe(false)
  })
})

describe("parseLabelFilter", () => {
  it("URL-decodes a value list joined by %2C", () => {
    expect(parseLabelFilter("label!=A%2CB")).toEqual(new Set(["a", "b"]))
  })

  it("lower-cases and trims the values, so Untranscodable matches the stored untranscodable", () => {
    expect(parseLabelFilter("label!= Untranscodable ")).toEqual(new Set(["untranscodable"]))
  })

  it("adds up the labels of filterAll and the type filter, joined by |", () => {
    expect(parseLabelFilter("label!=Kids|label!=Untranscodable%2CRaw")).toEqual(new Set(["kids", "untranscodable", "raw"]))
  })

  it("hides filterAll with a type filter when one of them is another form", () => {
    expect(parseLabelFilter("label!=A|contentRating=PG")).toBeNull()
    expect(parseLabelFilter("contentRating=PG|label!=A")).toBeNull()
  })

  it("hides every form other than label!=", () => {
    expect(parseLabelFilter("label=A")).toBeNull()
    expect(parseLabelFilter("year>=2000")).toBeNull()
  })

  it("hides a clause that does not decode, or holds no value", () => {
    expect(parseLabelFilter("label!=%E0%A4%A")).toBeNull()
    expect(parseLabelFilter("label!=")).toBeNull()
    expect(parseLabelFilter("label!=%2C%20")).toBeNull()
  })
})
