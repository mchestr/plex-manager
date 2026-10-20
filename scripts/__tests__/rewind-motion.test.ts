/**
 * @jest-environment node
 */

/** Rewind's motion rule (NFR-6, P5.2): one case per rule, failing and passing. */

import { motionViolations } from "../design-system/rewind-motion.mjs"

const TSX = "components/rewind/pages/example.tsx"
const CSS = "components/rewind/example.css"

const rules = (path: string, source: string): string[] =>
  motionViolations(path, source).map((v: { rule: string }) => v.rule)

describe("rewind-motion", () => {
  it("fails an infinite keyframe animation", () => {
    expect(rules(CSS, "@keyframes a { to { opacity: 0 } } .x { animation: a 1s infinite; }")).toContain("infinite")
  })

  it("fails repeat: Infinity and iterationCount: Infinity", () => {
    expect(rules(TSX, "<m.div animate={{ opacity: 0 }} transition={{ repeat: Infinity }} />")).toContain("infinite")
    expect(rules(TSX, "el.animate([], { iterationCount: Infinity })")).toContain("infinite")
  })

  it("fails a looping Tailwind utility", () => {
    expect(rules(TSX, '<span className="animate-pulse" />')).toEqual(["infinite"])
  })

  it("fails an animated width", () => {
    expect(rules(CSS, "@keyframes grow { from { width: 0 } to { width: 10px } }")).toEqual(["property"])
    expect(rules(TSX, "<m.div animate={{ width: 100 }} />")).toEqual(["property"])
    expect(rules(TSX, "animate(el, { height: 20 }, { duration: 0.2 })")).toEqual(["property"])
  })

  it("fails an animated colour", () => {
    expect(rules(CSS, ".x { transition: color 200ms ease, opacity 120ms; }")).toEqual(["property"])
    expect(rules(TSX, "<m.span initial={{ color: '#000' }} />")).toEqual(["property"])
    expect(rules(TSX, '<div style={{ transition: "background-color 1s" }} />')).toEqual(["property"])
    expect(rules(TSX, '<div className="transition-colors duration-200" />')).toEqual(["property"])
    expect(rules(TSX, '<div className="transition-[width,opacity]" />')).toEqual(["property"])
  })

  it("fails two font-axis animations in one file", () => {
    const css = "@keyframes a { to { font-variation-settings: 'wdth' 100 } } @keyframes b { to { font-variation-settings: 'wght' 900 } }"
    expect(rules(CSS, css)).toEqual(["font-axis"])
    const tsx = "<m.h2 animate={{ fontVariationSettings: '\"wdth\" 100' }} /><m.p animate={{ fontVariationSettings: '\"wght\" 900' }} />"
    expect(rules(TSX, tsx)).toEqual(["font-axis"])
  })

  it("passes transform, opacity and clip-path animations and one font-axis stretch", () => {
    const css = [
      "@keyframes roll { from { clip-path: inset(0 0 0 100%) } to { clip-path: inset(0) } }",
      "@keyframes leave { to { transform: translateX(-24px); opacity: 0 } }",
      "@keyframes stretch { from { font-variation-settings: 'wdth' 62 } to { font-variation-settings: 'wdth' 100 } }",
      ".x { transition: transform 200ms, opacity 120ms; }",
    ].join("\n")
    expect(rules(CSS, css)).toEqual([])
    const tsx = `<m.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, scaleX: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.65, 0, 0.35, 1], opacity: { duration: 0.12 } }} className="transition-opacity" />`
    expect(rules(TSX, tsx)).toEqual([])
  })

  it("reads only the Rewind block of app/globals.css", () => {
    const globals = [
      ".spinner { animation: spin 1s linear infinite; }",
      "/* rewind-scope:start */",
      "@keyframes rw-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }",
      "/* rewind-scope:end */",
    ].join("\n")
    expect(rules("app/globals.css", globals)).toEqual([])
    expect(rules("app/globals.css", globals.replace("transform: scaleX(1)", "width: 100%"))).toEqual(["property"])
  })
})
