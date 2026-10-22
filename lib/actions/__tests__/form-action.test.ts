/**
 * @jest-environment node
 *
 * The FormData adapter (P10.7): the form's own schema runs first, an action
 * failure keeps its field errors, and only the kept fields come back.
 */

import { z } from "zod"

import { formAction } from "@/lib/actions/form-action"
import { idleFormState } from "@/lib/actions/form-state"
import type { ActionResult } from "@/lib/actions/result"

const schema = z
  .object({ name: z.string().min(1, "Enter a name"), secret: z.string(), confirm: z.string() })
  .refine((f) => f.secret === f.confirm, { message: "Secrets do not match", path: ["confirm"] })

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

describe("formAction", () => {
  it("refuses on the form's schema without calling the action, keeping only the kept fields", async () => {
    const action = jest.fn()
    const submit = formAction(action, { schema, toInput: ({ name }) => ({ name }), keep: ["name"] })

    const state = await submit(idleFormState(), form({ name: "Den", secret: "a", confirm: "b" }))

    expect(state).toEqual({
      status: "error",
      data: null,
      error: "Secrets do not match",
      fieldErrors: { confirm: ["Secrets do not match"] },
      values: { name: "Den" },
    })
    expect(action).not.toHaveBeenCalled()
  })

  it("reads a missing kept field as empty", async () => {
    const submit = formAction(jest.fn(), { schema, toInput: ({ name }) => ({ name }), keep: ["name"] })

    const state = await submit(idleFormState(), form({ secret: "a", confirm: "a" }))

    expect(state.values).toEqual({ name: "" })
    expect(state.fieldErrors.name).toEqual(["Invalid input: expected string, received undefined"])
  })

  it("passes the action's refusal and field errors through", async () => {
    const action = jest.fn(
      async (): Promise<ActionResult<null>> => ({ success: false, code: "CONFLICT", error: "That name is taken", fieldErrors: { name: ["That name is taken"] } })
    )
    const submit = formAction(action, { schema, toInput: ({ name }) => ({ name }), keep: ["name"] })

    const state = await submit(idleFormState(), form({ name: "Den", secret: "a", confirm: "a" }))

    expect(action).toHaveBeenCalledWith({ name: "Den" })
    expect(state).toEqual({
      status: "error",
      data: null,
      error: "That name is taken",
      fieldErrors: { name: ["That name is taken"] },
      values: { name: "Den" },
    })
  })
})
