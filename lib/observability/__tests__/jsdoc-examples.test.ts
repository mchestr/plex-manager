import { renderMetrics } from "@/lib/observability/prometheus-text"

describe("JSDoc Documentation Examples", () => {
  it("renderMetrics writes HELP, TYPE and a labelled sample", () => {
    expect(
      renderMetrics([{ name: "up", help: "Up.", type: "gauge", samples: [{ labels: { source: "db" }, value: 1 }] }])
    ).toBe('# HELP up Up.\n# TYPE up gauge\nup{source="db"} 1\n')
  })

  it("escapes label values and leaves out a metric without samples", () => {
    expect(
      renderMetrics([
        { name: "empty", help: "Nothing.", type: "counter", samples: [] },
        { name: "odd", help: "Odd.", type: "gauge", samples: [{ labels: { job: 'a"b\\c\nd' }, value: Infinity }] },
      ])
    ).toBe('# HELP odd Odd.\n# TYPE odd gauge\nodd{job="a\\"b\\\\c\\nd"} +Inf\n')
  })
})
