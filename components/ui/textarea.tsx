import { Field as FieldPrimitive } from "@base-ui/react/field"
import type { ComponentProps } from "react"

import { fieldSurface } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type TextareaProps = ComponentProps<"textarea">

/**
 * A multi-line input with the Input surface (ui-design-system 5.4). It renders
 * through Base UI's `Field.Control`, so a surrounding `Field` labels it and
 * wires its description, error and `aria-invalid` the way it does for Input.
 */
export function Textarea({ className, id, name, value, defaultValue, disabled, ref, ...props }: TextareaProps) {
  // `overflow-x-hidden`: a textarea wraps, so it never scrolls sideways. With the
  // default `overflow: auto`, axe measures it by its scrollWidth, which leaves out
  // the border, so it reads the text as partly outside its own background and
  // reports color-contrast as incomplete.

  return (
    // Field.Control owns the id, name, value and disabled state, so they go to it.
    <FieldPrimitive.Control
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      render={
        <textarea
          ref={ref}
          data-slot="textarea"
          className={cn(
            fieldSurface,
            "block min-h-20 resize-y overflow-x-hidden px-3 py-2 focus-visible:border-ring focus-visible:-outline-offset-2 aria-invalid:focus-visible:outline-destructive",
            className
          )}
          {...props}
        />
      }
    />
  )
}
