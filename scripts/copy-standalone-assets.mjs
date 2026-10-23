#!/usr/bin/env node
/**
 * `postbuild`: copies `.next/static` and `public` into `.next/standalone`, as
 * the Dockerfile does, so `npm run start:prod` serves a complete app outside
 * the image (P11.24). `next build` leaves both out of the standalone folder.
 */

import { cpSync, existsSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const standalone = path.join(root, ".next/standalone")

if (!existsSync(standalone)) {
  console.error("copy-standalone-assets: .next/standalone is missing; run next build first")
  process.exit(1)
}

for (const [from, to] of [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
]) {
  cpSync(path.join(root, from), path.join(root, to), { recursive: true })
}
