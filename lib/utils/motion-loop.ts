import type { Transition } from "motion/react"

type Keyframes = Record<string, string | number | (string | number)[]>

/**
 * Props for an infinite Motion loop that respects reduced motion.
 *
 * `<MotionConfig reducedMotion="user">` stops transform and layout
 * animations only, so a `repeat: Infinity` loop on opacity or colour keeps
 * running for people who asked for less motion. Under reduced motion this
 * returns each value's final keyframe with a zero-length transition, so the
 * element rests where one loop would end.
 *
 * @example
 * ```ts
 * loop(true, { opacity: [0.3, 0.6, 0.3], scale: 1 }, { duration: 3, repeat: Infinity })
 * // => { animate: { opacity: 0.3, scale: 1 }, transition: { duration: 0 } }
 * loop(false, { opacity: [0.3, 0.6] }, { repeat: Infinity })
 * // => { animate: { opacity: [0.3, 0.6] }, transition: { repeat: Infinity } }
 * ```
 */
export function loop(
  reduceMotion: boolean | null,
  animate: Keyframes,
  transition: Transition
): { animate: Keyframes; transition: Transition } {
  if (!reduceMotion) return { animate, transition }
  const rest: Keyframes = {}
  for (const [key, value] of Object.entries(animate)) {
    rest[key] = Array.isArray(value) ? value[value.length - 1] : value
  }
  return { animate: rest, transition: { duration: 0 } }
}
