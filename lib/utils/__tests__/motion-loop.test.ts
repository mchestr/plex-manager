import { loop } from "@/lib/utils/motion-loop"

describe("loop", () => {
  it("matches the documented examples", () => {
    expect(loop(true, { opacity: [0.3, 0.6, 0.3], scale: 1 }, { duration: 3, repeat: Infinity })).toEqual({
      animate: { opacity: 0.3, scale: 1 },
      transition: { duration: 0 },
    })
    expect(loop(false, { opacity: [0.3, 0.6] }, { repeat: Infinity })).toEqual({
      animate: { opacity: [0.3, 0.6] },
      transition: { repeat: Infinity },
    })
  })

  it("keeps looping before the reduced-motion setting is known", () => {
    const animate = { rotate: [0, -10, 10, -10, 0] }
    const transition = { duration: 0.5, repeat: Infinity }

    expect(loop(null, animate, transition)).toEqual({ animate, transition })
  })

  it("rests every value on its final keyframe under reduced motion", () => {
    expect(loop(true, { opacity: [0, 1, 0], scale: [0, 1, 0], x: 40 }, { repeat: Infinity }).animate).toEqual({
      opacity: 0,
      scale: 0,
      x: 40,
    })
  })
})
