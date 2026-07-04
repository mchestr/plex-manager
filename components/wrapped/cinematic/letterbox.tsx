"use client"

import { motion } from "framer-motion"

/**
 * Cinema letterbox bars that close in from the top and bottom edges when the
 * experience mounts, framing every slide.
 */
export function Letterbox() {
  return (
    <>
      <motion.div
        aria-hidden
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed top-0 inset-x-0 z-30 h-[6vh] min-h-8 bg-black"
      />
      <motion.div
        aria-hidden
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed bottom-0 inset-x-0 z-30 h-[6vh] min-h-8 bg-black"
      />
    </>
  )
}
