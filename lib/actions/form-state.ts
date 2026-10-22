/**
 * The state a `<form action>` keeps between submits (P10.7, BP-32): what
 * `formAction` (`lib/actions/form-action.ts`) returns and `useActionState`
 * holds. Client-safe, so forms import it.
 *
 * React 19 resets an uncontrolled form after its action runs. `values` holds
 * the fields the action echoes back (never a secret), so a form re-seeds them
 * through `defaultValue` after an error and nothing typed is lost (WCAG 3.3.7).
 *
 * @module lib/actions/form-state
 */

export interface FormState<T = null> {
  status: "idle" | "success" | "error"
  /** The action's data after a success. */
  data: T | null
  /** Copy for the whole form; field errors carry their own. */
  error: string | null
  fieldErrors: Record<string, string[] | undefined>
  /** The kept fields as submitted, for `defaultValue`. */
  values: Record<string, string>
}

/** The state before the first submit. */
export function idleFormState<T = null>(): FormState<T> {
  return { status: "idle", data: null, error: null, fieldErrors: {}, values: {} }
}
