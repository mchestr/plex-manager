#!/usr/bin/env node
/**
 * `postbuild`: copies `.next/static` and `public` into `.next/standalone`, as
 * the Dockerfile does, so `npm run start:prod` serves a complete app outside
 * the image (P11.24). `next build` leaves both out of the standalone folder.
 * It also drops the cached 200 from the prerendered pages, so proxy.ts's 404s
 * survive (`scripts/build/prerender-status.mjs`).
 */

import { cpSync, existsSync } from "node:fs"
import path from "node:path"

import { stripPrerenderStatus } from "./build/prerender-status.mjs"

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

stripPrerenderStatus([path.join(root, ".next/server/app"), path.join(standalone, ".next/server/app")])
