"use client"

import CountUp from "react-countup"

import { cn } from "@/lib/utils"

interface GoldCountUpProps {
  value: number
  className?: string
  delay?: number
  duration?: number
  suffix?: string
}

/** Large gold stat counter with tabular numerals */
export function GoldCountUp({
  value,
  className,
  delay = 0.4,
  duration = 2,
  suffix,
}: GoldCountUpProps) {
  return (
    <span
      className={cn(
        "font-serif tabular-nums bg-gradient-to-b from-gold-bright to-gold bg-clip-text text-transparent",
        className
      )}
    >
      <CountUp start={0} end={value} duration={duration} delay={delay} separator="," />
      {suffix ? <span className="text-[0.45em] tracking-widest uppercase ml-2 text-gold">{suffix}</span> : null}
    </span>
  )
}
