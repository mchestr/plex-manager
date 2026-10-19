"use client"

import { motion } from "motion/react"

interface SectionHeaderProps {
  title: string
  subtitle?: string
  titleDelay?: number
  subtitleDelay?: number
}

export function SectionHeader({
  title,
  subtitle,
  titleDelay = 0,
  subtitleDelay = 0.2
}: SectionHeaderProps) {
  return (
    <>
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: titleDelay }}
        className="text-3xl sm:text-4xl font-bold text-white mb-2"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: subtitleDelay }}
          className="text-base sm:text-lg text-purple-200 mb-6"
        >
          {subtitle}
        </motion.p>
      )}
    </>
  )
}

