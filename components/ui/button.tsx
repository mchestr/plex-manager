import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import type { ReactNode } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * The Button recipe (ui-design-system 5.4). Exported for the rare element that
 * must look like a button without being one.
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-medium select-none",
    "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    // A busy button keeps its variant colour; only a plain disabled one turns muted.
    "data-disabled:pointer-events-none data-disabled:not-aria-busy:border-border data-disabled:not-aria-busy:bg-muted data-disabled:not-aria-busy:text-muted-foreground",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border-border-strong bg-secondary text-secondary-foreground hover:bg-secondary-hover hover:text-accent-foreground",
        outline: "border-border-strong bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground data-disabled:not-aria-busy:border-transparent data-disabled:not-aria-busy:bg-transparent",
        destructive: "border-destructive/40 bg-destructive-subtle text-destructive hover:bg-destructive/20",
        "destructive-solid": "bg-destructive font-semibold text-destructive-foreground",
        link: "text-foreground underline decoration-border-strong underline-offset-3 hover:decoration-foreground data-disabled:not-aria-busy:border-transparent data-disabled:not-aria-busy:bg-transparent",
        // Rewind scope only (lint keeps them in components/rewind): solid ink
        // never lightens, it underlines; the keyline reverses out on hover.
        ink: "border-[1.5px] border-primary bg-primary font-semibold text-primary-foreground decoration-[1.5px] underline-offset-4 hover:underline",
        "ink-outline":
          "border-[1.5px] border-primary bg-transparent font-semibold text-primary hover:bg-primary hover:text-primary-foreground",
      },
      size: {
        sm: "h-8 px-3 text-label",
        default: "h-9 px-4 text-ui",
        lg: "h-11 px-5 text-body",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0",
        // Rewind scope only: a 44px pill, and a 38px circle whose ::before
        // extends the hit area to 44px (Rewind 4.6).
        pill: "h-11 rounded-full px-5 text-ui",
        "icon-pill": "relative size-[38px] rounded-full p-0 before:absolute before:-inset-[3px] before:rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
)

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>

/** Names kept for today's call sites; P10.13 moves them and P10.11 drops them. */
type DeprecatedVariant = "danger" | "success"
type DeprecatedSize = "md"

const variantAliases: Record<DeprecatedVariant, Variant> = { danger: "destructive", success: "secondary" }

interface BaseButtonProps extends Omit<ButtonPrimitive.Props, "className"> {
  className?: string
  /**
   * `danger` (now `destructive`) and `success` (now `secondary`) are
   * deprecated. `ink` and `ink-outline` are for the Rewind scope only.
   */
  variant?: Variant | DeprecatedVariant
  /** The leading icon, 16px. A Spinner takes its place while `loading`. */
  icon?: ReactNode
  /**
   * Busy: a Spinner replaces the leading icon, the label becomes
   * `loadingLabel`, and the button is `aria-busy` and disabled but keeps focus
   * and its width.
   */
  loading?: boolean
  /** The progressive label shown while loading, such as "Saving". */
  loadingLabel?: ReactNode
}

/**
 * `md` (now `default`) is deprecated; `pill` and `icon-pill` are for the
 * Rewind scope only. An `icon-pill` holds only an icon, so it must be named.
 */
type ButtonProps = BaseButtonProps &
  ({ size: "icon-pill"; "aria-label": string } | { size?: Exclude<Size, "icon-pill"> | DeprecatedSize })

/**
 * The app's button, on Base UI Button.
 *
 * Base UI renders `type="button"`, so a submit button says `type="submit"`.
 * A link that looks like a button passes `render={<Link href="/x" />}` and
 * `nativeButton={false}`; it keeps the link role.
 */
export function Button({
  variant = "primary",
  size = "default",
  icon,
  loading,
  loadingLabel,
  disabled,
  render,
  nativeButton,
  className,
  children,
  ...props
}: ButtonProps) {
  const resolvedVariant = variant === "danger" || variant === "success" ? variantAliases[variant] : variant
  const resolvedSize = size === "md" ? "default" : size
  const busy = loading === true

  return (
    <ButtonPrimitive
      data-slot="button"
      render={render}
      nativeButton={nativeButton}
      // Base UI gives a non-native button role="button"; a link stays a link.
      {...(nativeButton === false ? { role: undefined } : {})}
      disabled={disabled || busy}
      focusableWhenDisabled={busy}
      aria-busy={busy || undefined}
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
      {...props}
    >
      {loading === undefined ? (
        <>
          {icon}
          {children}
        </>
      ) : (
        <span className="grid">
          <span aria-hidden={busy || undefined} className={cn(slot, busy && "invisible")}>
            {icon}
            {children}
          </span>
          <span aria-hidden={!busy || undefined} className={cn(slot, !busy && "invisible")}>
            <Spinner />
            {loadingLabel ?? children}
          </span>
        </span>
      )}
    </ButtonPrimitive>
  )
}

/** Both labels share one grid cell, so the button keeps the wider one's width. */
const slot = "col-start-1 row-start-1 inline-flex items-center justify-center gap-2"
