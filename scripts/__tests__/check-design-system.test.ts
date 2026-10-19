/**
 * @jest-environment node
 */

/**
 * The design-system guardrail (P1.8): every ui-design-system 9.6 rule counts
 * what it bans and nothing else, and the baseline comparison only lets counts
 * fall, carrying them across renames.
 */

import { compare, countFile, RULES, totals, update } from "../design-system/rules.mjs"

const FILE = "components/admin/example.tsx"

function count(source: string, path = FILE): Record<string, number> {
  return countFile(path, source)
}

describe("rules", () => {
  it("covers every 9.6 rule", () => {
    expect(RULES.map((rule: { id: string }) => rule.id).sort()).toEqual(
      [
        "arbitrary-color",
        "arbitrary-type-z",
        "blur",
        "caps-eyebrow",
        "copy",
        "gradient",
        "gradient-text",
        "infinite-motion",
        "raw-palette",
        "rewind-only",
        "zoom-lock",
      ].sort()
    )
  })

  const cases: Array<[rule: string, matching: string, nonMatching: string]> = [
    ["raw-palette", '<div className="text-white bg-black/60" />', '<div className="text-foreground bg-surface" />'],
    ["gradient", '<div className="bg-gradient-to-r" />', '<div className="bg-primary" />'],
    ["gradient-text", '<h1 className="bg-clip-text text-transparent" />', '<h1 className="text-foreground" />'],
    ["arbitrary-color", '<div className="bg-[#1a1a1a]" />', '<div className="w-[320px]" />'],
    ["arbitrary-type-z", '<p className="text-[13px] z-[60]" />', '<p className="text-sm z-50" />'],
    ["blur", '<div className="backdrop-blur-sm" />', '<div className="blur-none" />'],
    ["caps-eyebrow", '<p className="uppercase tracking-wide" />', '<p className="uppercase" />'],
    ["infinite-motion", '<div className="animate-pulse" />', '<div className="animate-spin animate-skeleton" />'],
    ["rewind-only", '<Button variant="ink" />', '<Button variant="primary" />'],
    ["copy", "<p>Your Wrapped</p>", "<WrappedViewer wrappedId={id} />"],
    ["zoom-lock", "export const viewport = { maximumScale: 1 }", "export const viewport = { width: 'device-width' }"],
  ]

  it.each(cases)("%s counts the matching fixture only", (rule, matching, nonMatching) => {
    expect(count(matching)[rule]).toBeGreaterThan(0)
    expect(count(nonMatching)[rule]).toBeUndefined()
  })

  it("counts each raw-palette utility", () => {
    expect(count('<div className="text-white hover:text-white border-slate-700" />')).toEqual({ "raw-palette": 3 })
  })

  it("allows animate-spin and animate-skeleton", () => {
    expect(count('<div className="animate-spin" /><div className="animate-skeleton" />')).toEqual({})
  })

  it("counts hex literals in style={{}} but not elsewhere", () => {
    expect(count("<div style={{ color: '#ff0000', background: `#000` }} />")).toEqual({ "arbitrary-color": 2 })
    expect(count("const accent = '#ff0000'\nconst x = <div style={styles.box} />")).toEqual({})
  })

  it("reads copy from JSX text and string children only", () => {
    expect(count("<a>Next{' '}{'->'}</a>")).toEqual({ copy: 1 })
    expect(count("<a>View all &rarr;</a>")).toEqual({ copy: 1 })
    expect(count("<p>Films · 12</p>")).toEqual({ copy: 1 })
    expect(count("<p>A Plex Rewind story</p>")).toEqual({ copy: 1 })
    expect(count("<p title=\"Wrapped\">{wrapped.title}</p>")).toEqual({})
    expect(count("const label = 'Wrapped'\n<p>{label}</p>")).toEqual({})
    expect(count("<p>Unwrapped gifts</p>")).toEqual({})
  })

  it("skips rewind-only and infinite-motion under components/rewind/", () => {
    const source = '<div className="animate-pulse font-display" />'
    expect(count(source, "components/rewind/page.tsx")).toEqual({})
    expect(count(source)).toEqual({ "infinite-motion": 1, "rewind-only": 1 })
  })

  it("skips the Rewind block of globals.css for the Rewind rules only", () => {
    const css = [
      ".a { color: var(--ink); }",
      "/* rewind-scope:start */",
      ".b { color: var(--rw-paper); } .c { @apply animate-pulse text-white; }",
      "/* rewind-scope:end */",
    ].join("\n")
    expect(count(css, "app/globals.css")).toEqual({ "raw-palette": 1, "rewind-only": 1 })
  })

  it("runs no AST rule on CSS", () => {
    expect(count("/* Wrapped -> */ .a {}", "app/globals.css")).toEqual({})
  })
})

describe("compare", () => {
  const baseline = { "a.tsx": { gradient: 2, "raw-palette": 5 }, "gone.tsx": { blur: 1 } }

  it("fails on a rise and names the file and rule", () => {
    const result = compare(baseline, { "a.tsx": { gradient: 3, "raw-palette": 5 } })
    expect(result.ok).toBe(false)
    expect(result.rises).toEqual([{ file: "a.tsx", rule: "gradient", was: 2, now: 3 }])
  })

  it("fails on a new file with a non-zero count, not on one at zero", () => {
    const current = { "a.tsx": baseline["a.tsx"], "new.tsx": { blur: 1 }, "clean.tsx": {} }
    const result = compare(baseline, current)
    expect(result.ok).toBe(false)
    expect(result.added).toEqual([{ file: "new.tsx", counts: { blur: 1 } }])
  })

  it("passes on a drop and reports it", () => {
    const result = compare(baseline, { "a.tsx": { gradient: 1 } })
    expect(result.ok).toBe(true)
    expect(result.drops).toEqual([
      { file: "a.tsx", rule: "gradient", was: 2, now: 1 },
      { file: "a.tsx", rule: "raw-palette", was: 5, now: 0 },
    ])
  })

  it("ignores deleted files", () => {
    const result = compare(baseline, { "a.tsx": baseline["a.tsx"] })
    expect(result.ok).toBe(true)
    expect(result.deleted).toEqual(["gone.tsx"])
  })

  it("carries counts across a rename", () => {
    const current = { "b.tsx": { gradient: 2, "raw-palette": 5 }, "gone.tsx": { blur: 1 } }
    expect(compare(baseline, current).ok).toBe(false)
    const result = compare(baseline, current, [["a.tsx", "b.tsx"]])
    expect(result).toMatchObject({ ok: true, rises: [], added: [], deleted: [] })
    const risen = compare(baseline, { ...current, "b.tsx": { gradient: 3, "raw-palette": 5 } }, [["a.tsx", "b.tsx"]])
    expect(risen.rises).toEqual([{ file: "b.tsx", from: "a.tsx", rule: "gradient", was: 2, now: 3 }])
  })

  it("matches the documented example", () => {
    expect(compare({ "a.tsx": { gradient: 2 } }, { "b.tsx": { gradient: 1 } }, [["a.tsx", "b.tsx"]])).toEqual({
      ok: true,
      rises: [],
      added: [],
      deleted: [],
      drops: [{ file: "b.tsx", from: "a.tsx", rule: "gradient", was: 2, now: 1 }],
    })
  })
})

describe("update", () => {
  const baseline = { "a.tsx": { gradient: 2 }, "gone.tsx": { blur: 1 } }

  it("refuses to raise a count", () => {
    const result = update(baseline, { "a.tsx": { gradient: 3 } })
    expect(result.ok).toBe(false)
    expect(result.files).toBeUndefined()
  })

  it("refuses to add a file with a non-zero count", () => {
    expect(update(baseline, { "a.tsx": { gradient: 2 }, "new.tsx": { blur: 1 } }).ok).toBe(false)
  })

  it("lowers counts, drops deleted and zero files, and moves renames", () => {
    const result = update(baseline, { "b.tsx": { gradient: 1 }, "clean.tsx": {} }, [["a.tsx", "b.tsx"]])
    expect(result).toMatchObject({ ok: true, files: { "b.tsx": { gradient: 1 } } })
    expect(totals(result.files)).toEqual({ gradient: 1 })
  })
})
