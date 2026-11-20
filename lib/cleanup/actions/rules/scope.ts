/**
 * The checks of a rule definition that a create and a save run before they
 * write (TS 10.3 create steps 2 and 3, E18, TS 5.5): each library is a
 * library of the newest complete snapshot that the level's arr manages and
 * whose items have external ids, of the level's type; and each service that
 * a condition or a protection needs is set up. Server-only.
 *
 * @module lib/cleanup/actions/rules/scope
 */

import "server-only"

import { invalid, type RuleFailure } from "@/lib/cleanup/actions/rules/result"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import { loadPreviousCompleteHeader } from "@/lib/cleanup/snapshot/store"
import { getActiveService } from "@/lib/data/active-service"
import type { Condition, RuleDefinition } from "@/lib/validations/cleanup-rule"
import { FIELD_NEEDS, LEVEL_ARR, type Level, SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

/** The libraries of the newest complete snapshot (`facts.libraries`), or null with no complete snapshot. */
export async function newestLibraries(): Promise<readonly SnapshotLibrary[] | null> {
  const header = await loadPreviousCompleteHeader()
  return header?.facts?.libraries ?? null
}

/** Whether a library can hold the rule's titles: the level's type and arr, and external ids. @internal */
export function libraryInScope(library: SnapshotLibrary, level: Level): boolean {
  const type = level === "movie" ? "movie" : "show"
  return library.type === type && library.arr === LEVEL_ARR[level] && !library.noIds
}

/** Every condition of the definition, group members and protections included. */
export function leafConditions(definition: Pick<RuleDefinition, "conditions" | "protections">): Condition[] {
  return [...definition.conditions.flatMap((clause) => ("kind" in clause ? clause.conditions : [clause])), ...definition.protections]
}

/** The services that the fields of the definition need, in `SERVICES` order (TS 4.2 "Needs"). @internal */
export function neededServices(definition: Pick<RuleDefinition, "conditions" | "protections">): Service[] {
  const needs = new Set(leafConditions(definition).flatMap((condition) => FIELD_NEEDS[condition.field]))
  return SERVICES.filter((service) => needs.has(service))
}

/** The library refusal: `VALIDATION` `library_out_of_scope` on `libraries`. */
export function outOfScope(level: Level): RuleFailure {
  return invalid(`Choose only libraries that ${SERVICE_NAMES[LEVEL_ARR[level]]} manages.`, "libraries")
}

/**
 * The scope and service checks, or null when the definition passes. With no
 * complete snapshot, no library is known, so every library is out of scope
 * (`library_out_of_scope`). A missing service names the first condition that
 * needs it: "Set up Sonarr to use this".
 *
 * @param libraries - `facts.libraries` of the newest complete snapshot, when the caller read them.
 */
export async function checkRuleScope(definition: RuleDefinition, libraries?: readonly SnapshotLibrary[] | null): Promise<RuleFailure | null> {
  const known = libraries === undefined ? await newestLibraries() : libraries
  const inScope = new Set((known ?? []).filter((library) => libraryInScope(library, definition.level)).map((library) => library.sectionId))
  if (definition.libraries.some((sectionId) => !inScope.has(sectionId))) return outOfScope(definition.level)
  const missing = new Set<Service>()
  for (const service of neededServices(definition)) if (!(await getActiveService(service))) missing.add(service)
  for (const condition of leafConditions(definition)) {
    const service = FIELD_NEEDS[condition.field].find((need) => missing.has(need))
    if (service) return invalid(`Set up ${SERVICE_NAMES[service]} to use this`, condition.id)
  }
  return null
}
