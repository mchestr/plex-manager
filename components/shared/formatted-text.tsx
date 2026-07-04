"use client"

import { motion } from "framer-motion"
import { parseStyledText } from "@/lib/wrapped/text-processor"

interface FormattedTextProps {
  text: string
  className?: string
  /** Overrides the highlight styling (defaults to the space-theme gradient) */
  highlightClassName?: string
}

/**
 * Component that parses styling tags (<highlight>text</highlight>)
 * and renders them with animated gradient styling
 */
export function FormattedText({
  text,
  className = "",
  highlightClassName = "font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent",
}: FormattedTextProps) {
  const parts = parseStyledText(text)

  // If no styling tags found, return plain text
  if (parts.length === 1 && parts[0].type === "text") {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === "highlight") {
          return (
            <motion.span
              key={index}
              className={highlightClassName}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                duration: 0.5,
                delay: index * 0.1,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            >
              {part.content}
            </motion.span>
          )
        }
        return <span key={index}>{part.content}</span>
      })}
    </span>
  )
}

