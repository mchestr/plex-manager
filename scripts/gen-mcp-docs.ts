/**
 * Writes lib/mcp/action-docs.generated.ts, the MCP tool descriptions, from
 * the JSDoc above each action in actions/. `--check` exits 1 when the file is stale.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { extractActionDocs, renderActionDocs } from "../lib/mcp/action-docs"

const ROOT = path.resolve(__dirname, "..")
const OUT = path.join(ROOT, "lib/mcp/action-docs.generated.ts")

function actionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : actionFiles(full)
    return entry.name.endsWith(".ts") ? [full] : []
  })
}

export function buildActionDocs(): string {
  const docs: Record<string, string> = {}
  for (const file of actionFiles(path.join(ROOT, "actions")).sort()) {
    Object.assign(docs, extractActionDocs(readFileSync(file, "utf8")))
  }
  return renderActionDocs(docs)
}

if (require.main === module) {
  const next = buildActionDocs()
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== next) {
      console.error("lib/mcp/action-docs.generated.ts is stale: run npm run mcp:docs")
      process.exit(1)
    }
  } else {
    writeFileSync(OUT, next)
    console.log("Wrote lib/mcp/action-docs.generated.ts")
  }
}
