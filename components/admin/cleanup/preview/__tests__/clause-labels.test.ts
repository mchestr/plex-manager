import { clauseLabels, GROUP_NAME, labelOf } from "@/components/admin/cleanup/preview/clause-labels"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

const draft: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [
    { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
    { id: "c2", field: "file.size", op: "moreThan", value: {} },
    {
      id: "a1",
      kind: "anyOf",
      conditions: [
        { id: "c3", field: "request.exists", op: "is", value: { exists: false } },
        { id: "c4", field: "watch.plays", op: "fewerThan", value: { count: 2 } },
      ],
    },
  ],
  protections: [],
  then: {},
}

describe("clauseLabels", () => {
  it("gives each top-level clause its row sentence and short name", () => {
    const labels = clauseLabels(draft)
    expect(labels.map((label) => label.id)).toEqual(["c1", "c2", "a1"])
    expect(labels[0]).toEqual({ id: "c1", name: "Added", sentence: "Added more than 365 days ago" })
    expect(labels[1].name).toBe("Size")
    expect(labels[1].sentence).toBe("Size more than Enter a size")
    expect(labels[2].name).toBe(GROUP_NAME)
    expect(labels[2].sentence).toMatch(/^Any of: requested in Overseerr: no, or plays fewer than 2/)
  })

  it("finds a label by id", () => {
    const labels = clauseLabels(draft)
    expect(labelOf(labels, "a1")?.name).toBe("Any of these")
    expect(labelOf(labels, "c9")).toBeUndefined()
  })
})
