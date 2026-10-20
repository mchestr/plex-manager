import { Field as FieldPrimitive } from "@base-ui/react/field"
import { CircleAlert } from "lucide-react"

import { Icon } from "@/components/ui/icon"
import { labelClasses, OptionalMark } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type WithClassName<P> = Omit<P, "className"> & { className?: string }

/**
 * One form field on Base UI Field (ui-design-system 5.4, UI-13): it ties the
 * label to the control with `htmlFor`, lists the description and error ids
 * in the control's `aria-describedby`, and sets `aria-invalid` on the control
 * while `invalid` is true. `FormField` composes it for the common case.
 */
export function Field({ className, ...props }: WithClassName<FieldPrimitive.Root.Props>) {
  return <FieldPrimitive.Root data-slot="field" className={cn("flex flex-col gap-1.5", className)} {...props} />
}

interface FieldLabelProps extends WithClassName<FieldPrimitive.Label.Props> {
  /** Adds "(optional)" after the text. */
  optional?: boolean
}

export function FieldLabel({ optional, className, children, ...props }: FieldLabelProps) {
  return (
    <FieldPrimitive.Label data-slot="field-label" className={cn(labelClasses, className)} {...props}>
      {children}
      {optional && " "}
      {optional && <OptionalMark />}
    </FieldPrimitive.Label>
  )
}

/** 13px muted help text under the control. */
export function FieldDescription({ className, ...props }: WithClassName<FieldPrimitive.Description.Props>) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn("text-label font-normal text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * 13px destructive error text with a `circle-alert` icon. It shows whenever
 * it renders (`match` defaults to `true`), so render it only with a message;
 * pass a `ValidityState` key as `match` to tie it to native validation instead.
 */
export function FieldError({ className, children, match = true, ...props }: WithClassName<FieldPrimitive.Error.Props>) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      match={match}
      className={cn("flex items-start gap-1.5 text-label font-normal text-destructive", className)}
      {...props}
    >
      <Icon icon={CircleAlert} size={14} className="mt-0.5" />
      <span>{children}</span>
    </FieldPrimitive.Error>
  )
}
