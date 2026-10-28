/**
 * What Rewind's freeze lock covers (P8.1, design 8.6), and its hashes.
 *
 * ## Sections
 *
 * | Section | Value hashed |
 * |---|---|
 * | `promptVersion` | `PROMPT_VERSION` |
 * | `systemPrompt` | `systemPrompt()`, the frozen system block |
 * | `wireSchema` | `z.toJSONSchema(RewindCopyV3Wire)` |
 * | `copySlots` | each slot's id, `maxChars`, `allowedFacts`, `identity` and `bands` |
 * | `grounding` | banned and window phrases, number words, counted nouns, quantifier thresholds and the word-list hash |
 * | `posterLines` | the sixty poster lines |
 * | `slotTemplates` | every slot's fallback variants |
 * | `catalogue` | `CATALOGUE_VERSION` and each fact's id, group, unit and format |
 * | `model` | the selected model: provider, model, budget model, effort and output limit |
 *
 * Each hash is a sha256 over `canonicalJson` of the value. Headlines, Notes
 * and UI strings are outside the lock, so typo fixes and December's P1 text
 * never trip it; `statsVersion` is outside too, because a stats bug fix is a
 * data fix.
 *
 * Pure: the script and the tests import it, the runtime reads only the lock
 * file (`lock.ts`).
 *
 * @module lib/wrapped/freeze/sections
 */

import { z } from "zod"

import { sha256Hex } from "@/lib/utils/sha256"
import { BANNED_PHRASES, COUNTED, NUMBER_WORDS, QUANTIFIERS, WINDOW_PHRASES } from "@/lib/wrapped/copy/grounding-words"
import { POSTER_LINES } from "@/lib/wrapped/copy/poster-lines"
import { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import { COPY_SLOTS } from "@/lib/wrapped/copy/slots"
import { SLOT_TEMPLATES } from "@/lib/wrapped/copy/templates"
import { COMMON_WORDS } from "@/lib/wrapped/copy/wordlist"
import { CATALOGUE_VERSION, FACTS } from "@/lib/wrapped/facts/catalogue"
import { canonicalJson } from "@/lib/wrapped/facts/hash"
import { PROMPT_VERSION, systemPrompt } from "@/lib/wrapped/prompt/rewind-2026"

import type { LockModel } from "./lock"

/**
 * The sections, in the lock's order.
 *
 * @internal the tests check that the lock has each one
 */
export const FREEZE_SECTIONS = [
  "promptVersion",
  "systemPrompt",
  "wireSchema",
  "copySlots",
  "grounding",
  "posterLines",
  "slotTemplates",
  "catalogue",
  "model",
] as const

type FreezeSection = (typeof FREEZE_SECTIONS)[number]

export type FreezeInputs = Record<FreezeSection, unknown>

export type FreezeHashes = Record<FreezeSection, string>

const sorted = (values: Iterable<string>) => [...values].sort()

/** The values the lock covers, read from the code as it stands, with `model` from `evals/rewind/selected.json`. */
export function freezeInputs(model: LockModel | null): FreezeInputs {
  return {
    promptVersion: PROMPT_VERSION,
    systemPrompt: systemPrompt(),
    wireSchema: z.toJSONSchema(RewindCopyV3Wire),
    copySlots: Object.values(COPY_SLOTS).map(({ id, maxChars, allowedFacts, identity, bands }) => ({ id, maxChars, allowedFacts, identity, bands })),
    grounding: {
      banned: BANNED_PHRASES,
      window: WINDOW_PHRASES,
      numberWords: sorted(NUMBER_WORDS),
      counted: sorted(COUNTED),
      quantifiers: QUANTIFIERS.map(({ phrase, re, min, max }) => ({ phrase, re: re.source, min, max })),
      wordList: sha256Hex(sorted(COMMON_WORDS).join("\n")),
    },
    posterLines: POSTER_LINES,
    slotTemplates: SLOT_TEMPLATES,
    catalogue: {
      version: CATALOGUE_VERSION,
      facts: Object.entries(FACTS).map(([id, spec]) => ({ id, group: spec.group, unit: spec.unit, format: spec.format })),
    },
    model,
  }
}

/** Each section's sha256 over its canonical JSON. */
export function hashFreezeInputs(inputs: FreezeInputs): FreezeHashes {
  return Object.fromEntries(FREEZE_SECTIONS.map((section) => [section, sha256Hex(canonicalJson(inputs[section]))])) as FreezeHashes
}

/** The sections whose hash differs from the lock's, as "systemPrompt changed"; empty while nothing changed. */
export function driftOf(locked: Readonly<Partial<FreezeHashes>>, current: FreezeHashes): string[] {
  return FREEZE_SECTIONS.filter((section) => locked[section] !== current[section]).map((section) => `${section} changed`)
}
