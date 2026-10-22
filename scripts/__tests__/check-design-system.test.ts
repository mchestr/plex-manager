/**
 * @jest-environment node
 */

/**
 * The design-system guardrail (P1.8, P10.11): every ui-design-system 9.6 rule
 * counts what it bans and nothing else, and `--strict` fails on any count
 * outside the documented allowlist.
 */

import { spawnSync } from "node:child_process"
import path from "node:path"

import { ALLOWLIST, isAllowed, staleEntries, strictFailures } from "../design-system/allowlist.mjs"
import { countFile, RULES, totals } from "../design-system/rules.mjs"

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
        "client-marker",
        "copy",
        "gradient",
        "gradient-text",
        "infinite-motion",
        "inline-spinner",
        "inline-svg",
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
    ["inline-spinner", '<path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />', '<Spinner className="size-4" />'],
    ["inline-svg", '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>', "<Icon icon={icons.done} />"],
  ]

  it.each(cases)("%s counts the matching fixture only", (rule, matching, nonMatching) => {
    expect(count(matching)[rule]).toBeGreaterThan(0)
    expect(count(nonMatching)[rule]).toBeUndefined()
  })

  describe("client-marker", () => {
    const marked = (body: string) => `"use client"\n\n${body}`

    it("counts a client marker on a render-only module", () => {
      expect(count(marked('export function Banner() {\n  return <p className="text-ui">Hi</p>\n}\n'))).toEqual({ "client-marker": 1 })
      expect(count(marked("export const Leaf = () => <span />\n"), "components/ui/leaf.tsx")).toEqual({ "client-marker": 1 })
    })

    it.each([
      ["a hook", "const [open, setOpen] = useState(false)"],
      ["a handler prop", "<button onClick={() => go()} />"],
      ["a browser global", "window.scrollTo(0, 0)"],
      ["document", "document.title = 'x'"],
      ["motion", '<motion.div animate={{ opacity: 1 }} />'],
      ["an element render prop", '<DialogTrigger render={<Button />}>Open</DialogTrigger>'],
    ])("does not count a module that uses %s", (_case, body) => {
      expect(count(marked(body))["client-marker"]).toBeUndefined()
    })

    it("counts nothing without the directive, or after a leading comment only when the directive is first", () => {
      expect(count('export function Banner() {\n  return <p>Hi</p>\n}\n')).toEqual({})
      expect(count('// Banner\n"use client"\nexport const A = () => <p />\n')).toEqual({ "client-marker": 1 })
      expect(count('const note = "use client"\nexport const A = () => <p />\n')).toEqual({})
    })

    it("skips leading block comments, and an unclosed comment run returns quickly", () => {
      expect(count('/* a */ /** b */\n"use client"\nexport const A = () => <p />\n')).toEqual({ "client-marker": 1 })
      const started = Date.now()
      expect(count(`/*${"*//*".repeat(50_000)}`)).toEqual({})
      expect(Date.now() - started).toBeLessThan(1000)
    })

    it("skips Next error boundaries, which must be client components", () => {
      expect(count(marked("export default function Error() {\n  return <p />\n}\n"), "app/admin/error.tsx")).toEqual({})
      expect(count(marked("export default function GlobalError() {\n  return <p />\n}\n"), "app/global-error.tsx")).toEqual({})
    })
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

  it("skips rewind-only, but not infinite-motion, on the primitives sheet under app/dev/", () => {
    const source = '<Button variant="ink" size="icon-pill" className="animate-pulse" />'
    expect(count(source, "app/dev/ui/_sections/ink.tsx")).toEqual({ "infinite-motion": 1 })
    expect(count(source, "app/admin/page.tsx")).toEqual({ "infinite-motion": 1, "rewind-only": 2 })
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

  it("leaves inline SVG to charts and Rewind art", () => {
    const svg = '<svg viewBox="0 0 10 10" />'
    expect(count(svg, "components/rewind/pages/clock.tsx")["inline-svg"]).toBeUndefined()
    expect(count(svg, "components/admin/charts/bars.tsx")["inline-svg"]).toBeUndefined()
    expect(count(svg, "components/admin/users/row.tsx")["inline-svg"]).toBe(1)
    expect(count("<motion.svg />")["inline-svg"]).toBeUndefined()
  })

  it("runs no AST rule on CSS", () => {
    expect(count("/* Wrapped -> */ .a {}", "app/globals.css")).toEqual({})
  })
})

describe("totals", () => {
  it("sums each rule across files", () => {
    expect(totals({ "a.tsx": { gradient: 2, blur: 1 }, "b.tsx": { gradient: 1 } })).toEqual({ blur: 1, gradient: 3 })
  })
})

describe("--strict", () => {
  const allowlist = [
    { path: "components/wrapped/", reason: "v2 viewer" },
    { path: "components/admin/pane.tsx", rules: ["client-marker"], reason: "passes renderers" },
  ]

  it("fails on one match outside the allowlist", () => {
    expect(strictFailures({ "components/admin/users/row.tsx": { "raw-palette": 1 }, "components/admin/ok.tsx": {} }, allowlist)).toEqual([
      { file: "components/admin/users/row.tsx", rule: "raw-palette", count: 1 },
    ])
  })

  it("passes on an allowlisted folder, and on an allowlisted file for its rules only", () => {
    expect(strictFailures({ "components/wrapped/hero.tsx": { gradient: 4, copy: 1 } }, allowlist)).toEqual([])
    expect(strictFailures({ "components/admin/pane.tsx": { "client-marker": 1 } }, allowlist)).toEqual([])
    expect(strictFailures({ "components/admin/pane.tsx": { "client-marker": 1, blur: 1 } }, allowlist)).toEqual([
      { file: "components/admin/pane.tsx", rule: "blur", count: 1 },
    ])
  })

  it("matches a folder entry by prefix and a file entry exactly", () => {
    expect(isAllowed("components/wrapped/a/b.tsx", "gradient", allowlist)).toBe(true)
    expect(isAllowed("components/wrapped-legacy.tsx", "gradient", allowlist)).toBe(false)
    expect(isAllowed("components/admin/pane.tsx.bak", "client-marker", allowlist)).toBe(false)
  })

  it("reports entries that cover nothing any more", () => {
    expect(staleEntries({ "components/wrapped/hero.tsx": { gradient: 1 } }, allowlist)).toEqual([allowlist[1]])
  })

  it("gives every real entry a reason", () => {
    for (const entry of ALLOWLIST) expect(entry.reason.length).toBeGreaterThan(10)
  })

  it("matches the documented example", () => {
    expect(
      strictFailures({ "components/admin/a.tsx": { "raw-palette": 2 }, "components/wrapped/b.tsx": { blur: 1 } })
    ).toEqual([{ file: "components/admin/a.tsx", rule: "raw-palette", count: 2 }])
  })

  it("passes on the repository as it stands", () => {
    const script = path.resolve(__dirname, "../check-design-system.mjs")
    const result = spawnSync(process.execPath, [script, "--strict"], { encoding: "utf8" })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  })
})
