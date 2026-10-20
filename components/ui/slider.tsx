"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderName = { "aria-label": string; "aria-labelledby"?: never } | { "aria-labelledby": string; "aria-label"?: never }

type SliderProps = Omit<SliderPrimitive.Root.Props<number>, "className" | "aria-label" | "aria-labelledby"> &
  SliderName & {
    className?: string
    /**
     * The spoken value of the thumb, such as "August" for a month scrubber.
     * Required: a bare number rarely says what the value means.
     */
    getAriaValueText: (formattedValue: string, value: number) => string
    "data-testid"?: string
  }

/**
 * A single-thumb slider on Base UI Slider (ui-design-system 5.4): a 4px
 * `input` track, a `primary-indicator` range and an 18px thumb whose 2px
 * `primary-indicator` edge carries the 3:1. The arrows, Page Up and Down,
 * Home and End move it; touch gets a 44px hit area. In Rewind every part is
 * ink and the unfilled track is hatched (`app/globals.css`). A client
 * component, because it wraps `getAriaValueText`.
 */
export function Slider({
  getAriaValueText,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn("w-full touch-none select-none", className)} {...props}>
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex h-5 w-full items-center pointer-coarse:h-11 data-disabled:cursor-not-allowed"
      >
        <SliderPrimitive.Track data-slot="slider-track" className="relative h-1 w-full rounded-full bg-input/45">
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="rounded-full bg-primary-indicator data-disabled:bg-muted-foreground"
          />
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            getAriaValueText={(formatted, value) => getAriaValueText(formatted, value)}
            className={cn(
              "size-4.5 rounded-full border-2 border-primary-indicator bg-background",
              // The range input inside takes focus; the ring belongs on the thumb.
              "has-focus-visible:outline-(length:--focus-width) has-focus-visible:outline-offset-(--focus-offset) has-focus-visible:outline-ring has-focus-visible:outline-solid",
              "data-disabled:border-muted-foreground"
            )}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
