"use client"

import { useReducer } from "react"
import type { z } from "zod"

import type { DryRunInput } from "@/lib/rewind/dry-run/input"

export type DryRunRequest = z.input<typeof DryRunInput>

export type Effort = NonNullable<DryRunRequest["effort"]>

/** The form's choices. `model` is a model id or `default`, the provider's own model. */
export interface PlaygroundForm {
  subject: "fixture" | "member"
  fixtureId: string
  userId: string
  model: string
  promptVersion: string
  effort: Effort
  copyPolicy: "default" | "no-llm"
}

interface PaidEstimate {
  provider: string
  model: string
  costUsd: number
  maxCostUsd: number
}

/** Where the run is: nothing yet, pricing it, waiting on the confirm, queued and polling, or failed. */
export type PlaygroundPhase =
  | { kind: "idle" }
  | { kind: "estimating" }
  | { kind: "confirming"; estimate: PaidEstimate }
  | { kind: "starting" }
  | { kind: "running"; id: string }
  | { kind: "failed"; message: string }

/** @internal Exported for the reducer tests. */
export interface PlaygroundState {
  form: PlaygroundForm
  phase: PlaygroundPhase
}

type PlaygroundAction =
  | { type: "set"; patch: Partial<PlaygroundForm> }
  | { type: "estimating" }
  | { type: "confirm"; estimate: PaidEstimate }
  | { type: "cancel" }
  | { type: "starting" }
  | { type: "running"; id: string }
  | { type: "failed"; message: string }
  | { type: "finished" }

const busy = (phase: PlaygroundPhase) => phase.kind === "estimating" || phase.kind === "starting" || phase.kind === "running"

/** The playground's state machine (UI-43: one reducer instead of a dozen `useState`s). @internal Exported for its tests. */
export function playgroundReducer(state: PlaygroundState, action: PlaygroundAction): PlaygroundState {
  switch (action.type) {
    case "set": {
      if (busy(state.phase)) return state
      const form = { ...state.form, ...action.patch }
      // Recorded answers exist only for fixtures.
      if (form.subject === "member" && form.model === REPLAY_MODEL) form.model = DEFAULT_MODEL
      return { form, phase: state.phase.kind === "failed" ? { kind: "idle" } : state.phase }
    }
    case "estimating":
      return busy(state.phase) ? state : { ...state, phase: { kind: "estimating" } }
    case "confirm":
      return { ...state, phase: { kind: "confirming", estimate: action.estimate } }
    case "cancel":
      return state.phase.kind === "confirming" ? { ...state, phase: { kind: "idle" } } : state
    case "starting":
      return { ...state, phase: { kind: "starting" } }
    case "running":
      return { ...state, phase: { kind: "running", id: action.id } }
    case "failed":
      return { ...state, phase: { kind: "failed", message: action.message } }
    case "finished":
      return { ...state, phase: { kind: "idle" } }
  }
}

/** The form's value for "the provider's own model". */
export const DEFAULT_MODEL = "default"

/** The model id that replays the selected model's recordings (`REPLAY_SELECTED` in `lib/rewind/dry-run/input.ts`). */
export const REPLAY_MODEL = "replay:selected"

/**
 * The action input for the form: the subject, the year that subject is run
 * for, and only the overrides the admin chose, so an untouched field keeps
 * the server's setting.
 */
export function toDryRunRequest(form: PlaygroundForm, context: { year: number }): DryRunRequest {
  const subject = form.subject === "fixture" ? { kind: "fixture" as const, fixtureId: form.fixtureId } : { kind: "member" as const, userId: form.userId }
  return {
    subject,
    year: context.year,
    effort: form.effort,
    copyPolicy: form.copyPolicy,
    ...(form.model !== DEFAULT_MODEL && form.copyPolicy === "default" ? { model: form.model } : {}),
  }
}

/** The form and run state; see {@link playgroundReducer}. */
export function usePlayground(form: PlaygroundForm) {
  const [state, dispatch] = useReducer(playgroundReducer, { form, phase: { kind: "idle" } })
  return { state, dispatch, busy: busy(state.phase) }
}
