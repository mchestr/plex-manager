/**
 * The FormData adapter for actions built with `publicAction`, `memberAction`
 * or `adminAction` (P10.7, BP-32): React 19's `(prevState, formData)` form
 * action on top of an action that takes an object.
 *
 * ```
 * formData -> schema.safeParse(fields)   VALIDATION + fieldErrors, no call
 *          -> action(toInput(fields))    the action's own guard, schema and limit
 *          -> FormState                  { status, data, error, fieldErrors, values }
 * ```
 *
 * `schema` checks what only the form has (a confirmation field, say); the
 * action still validates its own input. `keep` names the fields echoed back
 * in `values`, so a form can re-seed them after an error. Never keep a secret.
 *
 * @example
 * ```ts
 * // in a 'use server' module
 * export const renameThingForm = formAction(renameThing, {
 *   schema: z.object({ name: z.string() }),
 *   toInput: ({ name }) => ({ name }),
 *   keep: ["name"],
 * })
 * ```
 *
 * @module lib/actions/form-action
 */

import "server-only"

import { z } from "zod"

import type { FormState } from "@/lib/actions/form-state"
import type { ActionResult } from "@/lib/actions/result"

interface FormActionOptions<S extends z.ZodType, I> {
  /** Parses the submitted fields; its field errors land on the form. */
  schema: S
  /** Maps the parsed fields to the action's input. */
  toInput: (fields: z.output<S>) => I
  /** Fields echoed back in `values`, never a secret. */
  keep: readonly string[]
}

/** Text fields only: a file input has no place in these forms. */
function fieldsOf(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") fields[name] = value
  }
  return fields
}

export function formAction<S extends z.ZodType, I, T, C extends string>(
  action: (input: I) => Promise<ActionResult<T, C>>,
  { schema, toInput, keep }: FormActionOptions<S, I>
): (previous: FormState<T>, form: FormData) => Promise<FormState<T>> {
  return async (_previous, form) => {
    const fields = fieldsOf(form)
    const values = Object.fromEntries(keep.map((name) => [name, fields[name] ?? ""]))

    const parsed = schema.safeParse(fields)
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error)
      return {
        status: "error",
        data: null,
        error: parsed.error.issues[0]?.message ?? "Check the form",
        fieldErrors: fieldErrors as Record<string, string[]>,
        values,
      }
    }

    const result = await action(toInput(parsed.data))
    if (!result.success) {
      return { status: "error", data: null, error: result.error, fieldErrors: result.fieldErrors ?? {}, values }
    }
    return { status: "success", data: result.data, error: null, fieldErrors: {}, values }
  }
}
