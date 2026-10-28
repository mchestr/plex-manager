/** The playground's reducer and the action input it builds (P8.8, UI-43). */

import { act, renderHook } from "@testing-library/react"

import {
  DEFAULT_MODEL,
  playgroundReducer,
  REPLAY_MODEL,
  toDryRunRequest,
  usePlayground,
  type PlaygroundForm,
  type PlaygroundState,
} from "@/components/admin/rewind/playground/use-playground"
import { DryRunInput, REPLAY_SELECTED } from "@/lib/rewind/dry-run/input"

const form: PlaygroundForm = {
  subject: "fixture",
  fixtureId: "heavy",
  userId: "cluser0000000000000000001",
  model: DEFAULT_MODEL,
  promptVersion: "rewind-2026.1",
  effort: "low",
  copyPolicy: "default",
}

const idle: PlaygroundState = { form, phase: { kind: "idle" } }
const estimate = { provider: "anthropic", model: "claude-sonnet-5-5", costUsd: 0.02, maxCostUsd: 0.03 }
const context = { year: 2026 }

describe("playgroundReducer", () => {
  it("walks a paid run: estimate, confirm, start, poll, finish", () => {
    let state = playgroundReducer(idle, { type: "estimating" })
    expect(state.phase).toEqual({ kind: "estimating" })
    state = playgroundReducer(state, { type: "confirm", estimate })
    expect(state.phase).toEqual({ kind: "confirming", estimate })
    state = playgroundReducer(state, { type: "starting" })
    state = playgroundReducer(state, { type: "running", id: "run-1" })
    expect(state.phase).toEqual({ kind: "running", id: "run-1" })
    expect(playgroundReducer(state, { type: "finished" }).phase).toEqual({ kind: "idle" })
  })

  it("cancels only a pending confirm", () => {
    const confirming = playgroundReducer(idle, { type: "confirm", estimate })
    expect(playgroundReducer(confirming, { type: "cancel" }).phase).toEqual({ kind: "idle" })
    const running = playgroundReducer(idle, { type: "running", id: "run-1" })
    expect(playgroundReducer(running, { type: "cancel" })).toBe(running)
  })

  it("holds the form while a run is in flight and clears a failure on the next change", () => {
    const running = playgroundReducer(idle, { type: "running", id: "run-1" })
    expect(playgroundReducer(running, { type: "set", patch: { fixtureId: "light" } })).toBe(running)
    expect(playgroundReducer(running, { type: "estimating" })).toBe(running)
    const failed = playgroundReducer(idle, { type: "failed", message: "Too many dry runs" })
    expect(playgroundReducer(failed, { type: "set", patch: { fixtureId: "light" } })).toEqual({ form: { ...form, fixtureId: "light" }, phase: { kind: "idle" } })
  })

  it("drops the recorded-answer model when the subject becomes a member", () => {
    const replay = playgroundReducer(idle, { type: "set", patch: { model: REPLAY_MODEL } })
    expect(playgroundReducer(replay, { type: "set", patch: { subject: "member" } }).form.model).toBe(DEFAULT_MODEL)
  })
})

describe("toDryRunRequest", () => {
  it("sends only the overrides the admin chose, and parses as P7.10's input", () => {
    const request = toDryRunRequest(form, context)
    expect(request).toEqual({ subject: { kind: "fixture", fixtureId: "heavy" }, year: 2026, effort: "low", copyPolicy: "default" })
    expect(DryRunInput.safeParse(request).success).toBe(true)
  })

  it("passes a member and a model", () => {
    expect(toDryRunRequest({ ...form, subject: "member", model: "claude-haiku-5" }, context)).toMatchObject({
      subject: { kind: "member", userId: form.userId },
      model: "claude-haiku-5",
    })
  })

  it("sends no model for Templates only", () => {
    expect(toDryRunRequest({ ...form, model: "claude-haiku-5", copyPolicy: "no-llm" }, context)).not.toHaveProperty("model")
  })

  it("uses the dry run's replay id", () => {
    expect(REPLAY_MODEL).toBe(REPLAY_SELECTED)
  })
})

describe("usePlayground", () => {
  it("reports busy while a run is in flight", () => {
    const { result } = renderHook(() => usePlayground(form))
    expect(result.current.busy).toBe(false)
    act(() => result.current.dispatch({ type: "running", id: "run-1" }))
    expect(result.current.busy).toBe(true)
  })
})
