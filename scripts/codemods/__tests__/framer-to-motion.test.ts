/**
 * @jest-environment node
 */

/**
 * The framer-motion to motion codemod (P2.15) rewrites only the module
 * specifier: named imports, type imports, re-exports and jest.mock calls.
 */

import { rewrite } from "../framer-to-motion.mjs"

describe("framer-to-motion rewrite", () => {
  it("rewrites named imports and keeps the names", () => {
    expect(rewrite(`import { AnimatePresence, motion } from "framer-motion"\n`)).toBe(
      `import { AnimatePresence, motion } from "motion/react"\n`
    )
  })

  it("rewrites type imports and keeps the quote style", () => {
    expect(rewrite(`import type { Variants } from 'framer-motion'\n`)).toBe(`import type { Variants } from 'motion/react'\n`)
  })

  it("rewrites multi-line imports and re-exports", () => {
    const source = `import {\n  motion,\n  useReducedMotion,\n} from "framer-motion"\nexport { m } from 'framer-motion'\n`
    expect(rewrite(source)).toBe(
      `import {\n  motion,\n  useReducedMotion,\n} from "motion/react"\nexport { m } from 'motion/react'\n`
    )
  })

  it("rewrites jest.mock and jest.requireActual calls", () => {
    const source = `jest.mock('framer-motion', () => ({\n  ...jest.requireActual("framer-motion"),\n}))\n`
    expect(rewrite(source)).toBe(`jest.mock('motion/react', () => ({\n  ...jest.requireActual("motion/react"),\n}))\n`)
  })

  it("changes nothing else", () => {
    const source = [
      `// Mock framer-motion to avoid animation issues in tests`,
      `import { motion } from "framer-motion-extra"`,
      `import { cn } from "@/lib/utils"`,
      `const name = "framer-motion"`,
      ``,
    ].join("\n")
    expect(rewrite(source)).toBe(source)
  })
})
