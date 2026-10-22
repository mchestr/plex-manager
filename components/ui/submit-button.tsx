"use client"

import type { ComponentProps } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

type ButtonProps = ComponentProps<typeof Button>

/** Any Button but the icon-only Rewind pill, which no form submits with. */
type SubmitButtonProps = Omit<ButtonProps, "type" | "loading" | "size"> & { size?: Exclude<ButtonProps["size"], "icon-pill"> }

/**
 * A form's submit Button that shows its own pending state (P10.7): inside a
 * `<form action>`, `useFormStatus` drives Button's `loading`, so the label
 * becomes `loadingLabel` with a Spinner while the action runs.
 *
 * ```tsx
 * <form action={formAction}>
 *   <SubmitButton loadingLabel="Saving">Save</SubmitButton>
 * </form>
 * ```
 */
export function SubmitButton(props: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return <Button {...props} type="submit" loading={pending} />
}
