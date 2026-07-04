"use client"

/**
 * Animated film-grain overlay. SVG feTurbulence noise jittered by a CSS
 * steps() animation — no canvas, negligible cost. Pointer-events pass through.
 */
export function FilmGrain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-[-4%] z-20 opacity-[0.05] animate-grain motion-reduce:animate-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }}
    />
  )
}
