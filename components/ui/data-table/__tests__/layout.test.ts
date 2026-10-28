import { readFileSync } from "node:fs"
import path from "node:path"

import { cardSlot, cellClass, headerClass, TABLE_SIZES } from "@/components/ui/data-table/layout"

const globalsCss = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8")

/** The body of `@custom-variant <name> { ... }`, up to its closing brace at the start of a line. */
function variantBody(name: string): string {
  const match = globalsCss.match(new RegExp(`@custom-variant ${name} \\{\\n([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`@custom-variant ${name} is missing from app/globals.css`)
  return match[1]
}

describe("DataTable layout", () => {
  it("heads the card with the first column unless told otherwise, and leaves the rest out", () => {
    expect(cardSlot(undefined, 0)).toBe("title")
    expect(cardSlot(undefined, 2)).toBe("hidden")
    expect(cardSlot({ card: "field" }, 0)).toBe("field")
    expect(cardSlot({ card: "sub" }, 3)).toBe("sub")
  })

  it("hides a column's header and its cells together", () => {
    expect(headerClass({ card: "hidden" }, "hidden")).toContain("dt-cards:hidden")
    expect(cellClass({ card: "hidden" }, "hidden", false)).toContain("dt-cards:hidden")
    expect(headerClass({ card: "field", priority: 3 }, "field")).toContain("dt-compact:hidden")
    expect(cellClass({ card: "field", priority: 3 }, "field", false)).toContain("dt-compact:hidden")
    expect(cellClass({ card: "field" }, "field", false)).not.toContain(":hidden")
  })

  it("right-aligns an end column in the table and left-aligns it under its label on a card", () => {
    const classes = cellClass({ align: "end", card: "field" }, "field", false)
    expect(classes).toContain("text-right")
    expect(classes).toContain("dt-cards:text-left")
  })

  it("leaves room for the actions button beside the title and sub lines only", () => {
    expect(cellClass(undefined, "title", true)).toContain("dt-cards:pr-10")
    expect(cellClass({ card: "sub" }, "sub", true)).toContain("dt-cards:pr-10")
    expect(cellClass({ card: "field" }, "field", true)).not.toContain("dt-cards:pr-10")
    expect(cellClass(undefined, "title", false)).not.toContain("dt-cards:pr-10")
  })

  it.each(["dt-cards", "dt-compact"])("gives every table size a %s rule in app/globals.css", (variant) => {
    const body = variantBody(variant)
    for (const size of TABLE_SIZES) {
      expect(body).toMatch(new RegExp(`\\[data-table-size="${size}"\\] & \\{ @container data-table \\(`))
    }
    expect(body.match(/\[data-table-size=/g)).toHaveLength(TABLE_SIZES.length)
  })
})
