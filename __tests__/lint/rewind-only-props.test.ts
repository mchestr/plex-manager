/**
 * @jest-environment node
 *
 * The Rewind-only Button entries (P3.7, ui-design-system 4.4 and 9.6) are
 * lint errors outside `components/rewind/**`, the primitives and the dev
 * sheet. Runs ESLint with the repo config on in-memory sources; the paths
 * need not exist.
 */

import path from "node:path"

import { ESLint } from "eslint"

import config from "../../eslint.config.mjs"

const root = path.resolve(__dirname, "../..")
// The imported config, so Jest need not load the .mjs file itself at runtime.
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config })

async function rewindOnlyErrors(code: string, file: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) })
  return (result?.messages ?? []).filter(
    (m) => m.ruleId === "no-restricted-syntax" && m.severity === 2 && m.message.includes("Rewind scope only")
  ).length
}

const source = (props: string) =>
  `import { Button } from "@/components/ui/button"\nexport const Share = () => <Button ${props}>Share</Button>\n`

describe("Rewind-only Button entries", () => {
  it('errors on variant="ink" at components/admin/x.tsx and is clean at components/rewind/x.tsx', async () => {
    expect(await rewindOnlyErrors(source('variant="ink"'), "components/admin/x.tsx")).toBe(1)
    expect(await rewindOnlyErrors(source('variant="ink"'), "components/rewind/x.tsx")).toBe(0)
  })

  it.each([
    'variant="ink-outline"',
    'size="pill"',
    'size="icon-pill" aria-label="Close"',
    'variant={"ink"}',
    "size={'icon-pill'} aria-label=\"Close\"",
  ])("errors on %s outside Rewind", async (props) => {
    expect(await rewindOnlyErrors(source(props), "components/admin/x.tsx")).toBe(1)
  })

  it.each([
    "components/admin/users/x.tsx",
    "app/(app)/page.tsx",
    "app/api/rewind/card/route.tsx",
    "components/wrapped/x.tsx",
    "lib/rewind/cards/x.tsx",
  ])("errors at %s", async (file) => {
    expect(await rewindOnlyErrors(source('variant="ink" size="pill"'), file)).toBe(2)
  })

  it.each(["components/rewind/stage/chrome.tsx", "components/ui/x.tsx", "app/dev/ui/_sections/ink.tsx"])(
    "allows them at %s",
    async (file) => {
      expect(await rewindOnlyErrors(source('variant="ink-outline" size="icon-pill" aria-label="Close"'), file)).toBe(0)
    }
  )

  it.each(['variant="primary" size="lg"', 'variant="inkwell"', 'size="pillow"', 'data-variant="ink"'])(
    "leaves %s alone",
    async (props) => {
      expect(await rewindOnlyErrors(source(props), "components/admin/x.tsx")).toBe(0)
    }
  )
})
