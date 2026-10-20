import { parseTableParams, sortParam, tableHref } from "@/lib/ui/table-params"

const options = { sortable: ["name", "createdAt"], defaultSort: { id: "createdAt", desc: true } }

describe("parseTableParams", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseTableParams({}, options)).toEqual({
      page: 1,
      pageSize: 25,
      sort: { id: "createdAt", desc: true },
      q: "",
    })
  })

  it("reads page, page size, sort and search", () => {
    expect(parseTableParams(new URLSearchParams("page=3&pageSize=50&sort=-name&q=%20sam%20"), options)).toEqual({
      page: 3,
      pageSize: 50,
      sort: { id: "name", desc: true },
      q: "sam",
    })
    expect(parseTableParams({ sort: "name" }, options).sort).toEqual({ id: "name", desc: false })
  })

  it.each([
    ["page=0", "page", 1],
    ["page=-2", "page", 1],
    ["page=abc", "page", 1],
    ["page=1.5", "page", 1],
    ["pageSize=30", "pageSize", 25],
    ["pageSize=1000", "pageSize", 25],
    ["sort=email", "sort", options.defaultSort],
    ["sort=--name", "sort", options.defaultSort],
    ["sort=name;drop", "sort", options.defaultSort],
  ] as const)("falls back on bad input: %s", (query, key, expected) => {
    expect(parseTableParams(new URLSearchParams(query), options)[key]).toEqual(expected)
  })

  it("takes the first value of a repeated param", () => {
    expect(parseTableParams({ page: ["2", "9"] }, options).page).toBe(2)
  })

  it("honours custom page sizes", () => {
    expect(parseTableParams({}, { ...options, pageSizes: [10, 20] }).pageSize).toBe(10)
    expect(parseTableParams({ pageSize: "20" }, { ...options, pageSizes: [10, 20] }).pageSize).toBe(20)
  })
})

describe("tableHref", () => {
  it("keeps every param the patch does not name, such as conversationId", () => {
    const current = new URLSearchParams("conversationId=c_42&model=gpt&page=2")
    expect(tableHref("/admin/llm-usage", current, { page: 3 })).toBe("/admin/llm-usage?conversationId=c_42&model=gpt&page=3")
  })

  it("removes params patched to null, undefined or empty", () => {
    const current = { conversationId: "c_42", page: "2", q: "sam", sort: "name" }
    expect(tableHref("/admin/llm-usage", current, { page: null, q: "", sort: undefined })).toBe(
      "/admin/llm-usage?conversationId=c_42"
    )
  })

  it("returns the bare path when nothing is left", () => {
    expect(tableHref("/admin/users", { page: "2" }, { page: null })).toBe("/admin/users")
  })

  it("keeps repeated params from a record", () => {
    expect(tableHref("/x", { tag: ["a", "b"] }, { page: 2 })).toBe("/x?tag=a&tag=b&page=2")
  })
})

describe("sortParam", () => {
  it("prefixes a descending sort with a dash", () => {
    expect(sortParam({ id: "name", desc: false })).toBe("name")
    expect(sortParam({ id: "name", desc: true })).toBe("-name")
  })
})
