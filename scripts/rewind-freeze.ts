#!/usr/bin/env tsx
/**
 * Write or check Rewind's freeze lock (P8.1, `lib/wrapped/freeze/`).
 *
 * Usage:
 *   npm run rewind:freeze -- --check                      # CI: exit 1 when the prompt, catalogue or model drifted
 *   npm run rewind:freeze -- --write --reason="<why>"     # write the lock with a dated reason line
 *
 * The model comes from `evals/rewind/selected.json` (P5.13's bake-off). The
 * check also refuses a locked model that `lookupModel()` cannot price, that
 * has no structured outputs, or that retires before 2027-01-02.
 *
 * From the lock's `frozenAt` (2026-12-01), `--write` refuses a changed lock
 * under the same prompt version: bump `PROMPT_VERSION` and `LOCK_PATH` to
 * `rewind-2026.2`, with the owner's sign-off in the PR.
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { z } from "zod"

import { parseModelRef } from "@/evals/rewind/model-ref"
import { budgetModelFor, lookupModel, normalizeModelId } from "@/lib/llm/models"
import { freezeLockSchema, LOCK_PATH, lockedModelLabel, type FreezeLock, type LockModel } from "@/lib/wrapped/freeze/lock"
import { driftOf, freezeInputs, hashFreezeInputs } from "@/lib/wrapped/freeze/sections"
import { MAX_OUTPUT_TOKENS } from "@/lib/wrapped/pipeline/copy-llm"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"

const USAGE = 'Usage: npm run rewind:freeze -- --check | --write --reason="<why>"'
const SELECTED_PATH = "evals/rewind/selected.json"
/** The model must still be served on the last day of the season's December runs (design 8.2). */
const MODEL_NEEDED_UNTIL = "2027-01-02"
/** The day the lock first freezes; a new lock starts frozen from it. */
const FROZEN_AT = "2026-12-01"

const selectedSchema = z.object({ model: z.string().nullable(), economy: z.string().nullable(), effort: z.string() })

export interface FreezeDeps {
  readFile: (relative: string) => string | null
  writeFile: (relative: string, text: string) => void
  today: () => string
  print?: (line: string) => void
}

/** The lock's model from `selected.json`: null until the bake-off names one. */
export function selectedLockModel(text: string): LockModel | null {
  const selected = selectedSchema.parse(JSON.parse(text))
  if (!selected.model) return null
  if (selected.effort !== "low") throw new Error(`selected.json's effort must be "low" (design 8.1), not "${selected.effort}"`)
  const ref = parseModelRef(selected.model)
  const economy = selected.economy ? parseModelRef(selected.economy) : null
  if (economy && economy.provider !== ref.provider) throw new Error("selected.json's economy model must be on the same provider")
  return {
    provider: ref.provider,
    modelId: normalizeModelId(ref.id),
    budgetModelId: economy ? normalizeModelId(economy.id) : budgetModelFor(ref.provider),
    effort: "low",
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  }
}

/** Why the runtime could not run on the locked model, or an empty list. */
export function modelProblems(model: LockModel | null): string[] {
  if (!model) return []
  return [model.modelId, ...(model.budgetModelId ? [model.budgetModelId] : [])].flatMap((id) => {
    const info = lookupModel(model.provider, id)
    const label = `${model.provider}:${id}`
    const problems: string[] = []
    if (!info.pricing) problems.push(`${label} has no price in lib/llm/models.ts`)
    if (!info.capabilities.structuredOutputs) problems.push(`${label} does not support structured outputs`)
    if (info.retiresOn && info.retiresOn <= MODEL_NEEDED_UNTIL) problems.push(`${label} retires on ${info.retiresOn}, before ${MODEL_NEEDED_UNTIL}`)
    return problems
  })
}

function readLock(deps: FreezeDeps): FreezeLock | null {
  const text = deps.readFile(LOCK_PATH)
  return text === null ? null : freezeLockSchema.parse(JSON.parse(text))
}

/** Runs the script; returns the exit code (0 fine, 1 drift or refused, 2 bad arguments). */
export function main(argv: readonly string[], deps: FreezeDeps): number {
  const print = deps.print ?? console.log
  let values
  try {
    values = parseArgs({
      args: [...argv],
      options: { check: { type: "boolean", default: false }, write: { type: "boolean", default: false }, reason: { type: "string" } },
      strict: true,
    }).values
  } catch (error) {
    print(error instanceof Error ? error.message : String(error))
    print(USAGE)
    return 2
  }
  if (values.check === values.write || (values.write && !values.reason?.trim())) {
    print(USAGE)
    return 2
  }

  const selectedText = deps.readFile(SELECTED_PATH)
  if (selectedText === null) {
    print(`${SELECTED_PATH} is missing.`)
    return 1
  }
  const model = selectedLockModel(selectedText)
  const hashes = hashFreezeInputs(freezeInputs(model))
  const lock = readLock(deps)
  const problems = modelProblems(model)

  if (values.check) {
    if (!lock) {
      print(`No lock at ${LOCK_PATH}. Write it with --write.`)
      return 1
    }
    const drift = [...(lock.version === PROMPT_VERSION ? [] : [`the lock is ${lock.version}, the prompt is ${PROMPT_VERSION}`]), ...driftOf(lock.hashes, hashes), ...problems]
    if (drift.length > 0) {
      print(`The Rewind freeze lock ${lock.version} does not match the code:`)
      drift.forEach((line) => print(`  ${line}`))
      print("Change the lock only with a reason line and the owner's sign-off (docs/rewind.md, The freeze lock).")
      return 1
    }
    print(`The Rewind freeze lock ${lock.version} matches${lock.model ? `, model ${lockedModelLabel(lock.model)}` : ", no model selected yet"}.`)
    return 0
  }

  if (problems.length > 0) {
    problems.forEach((line) => print(`Refusing: ${line}.`))
    return 1
  }
  if (!LOCK_PATH.endsWith(`${PROMPT_VERSION}.lock.json`)) {
    print(`Refusing: LOCK_PATH (${LOCK_PATH}) must name ${PROMPT_VERSION}.`)
    return 1
  }
  const drift = lock ? driftOf(lock.hashes, hashes) : ["new lock"]
  if (lock && drift.length === 0) {
    print(`The lock ${lock.version} is unchanged.`)
    return 0
  }
  const today = deps.today()
  if (lock && lock.version === PROMPT_VERSION && today >= lock.frozenAt) {
    print(`Refusing: ${lock.version} is frozen since ${lock.frozenAt} (${drift.join(", ")}). Bump PROMPT_VERSION for a new lock.`)
    return 1
  }
  const next: FreezeLock = {
    version: PROMPT_VERSION,
    frozenAt: lock?.version === PROMPT_VERSION ? lock.frozenAt : FROZEN_AT,
    model,
    hashes,
    changes: [...(lock?.version === PROMPT_VERSION ? lock.changes : []), { on: today, reason: values.reason!.trim() }],
  }
  deps.writeFile(LOCK_PATH, `${JSON.stringify(next, null, 2)}\n`)
  print(`Wrote ${LOCK_PATH} (${drift.join(", ")}).`)
  return 0
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..")
  const file = (relative: string) => path.join(root, relative)
  process.exitCode = main(process.argv.slice(2), {
    readFile: (relative) => {
      try {
        return readFileSync(file(relative), "utf8")
      } catch {
        return null
      }
    },
    writeFile: (relative, text) => writeFileSync(file(relative), text),
    today: () => new Date().toISOString().slice(0, 10),
  })
}
