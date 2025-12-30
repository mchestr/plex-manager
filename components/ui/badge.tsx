"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-slate-700 text-slate-100 hover:bg-slate-600",
        destructive:
          "border-transparent bg-red-600 text-white hover:bg-red-500",
        success:
          "border-transparent bg-green-600 text-white hover:bg-green-500",
        warning:
          "border-transparent bg-amber-600 text-white hover:bg-amber-500",
        outline: "border-slate-600 text-slate-300",
        cyan:
          "border-transparent bg-cyan-600 text-white hover:bg-cyan-500",
        purple:
          "border-transparent bg-purple-600 text-white hover:bg-purple-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
