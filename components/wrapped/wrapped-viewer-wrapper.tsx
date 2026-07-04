"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { WrappedViewer } from "@/components/wrapped/wrapped-viewer"
import { WrappedTransition } from "@/components/wrapped/wrapped-transition"
import { WrappedData } from "@/types/wrapped"

interface WrappedViewerWrapperProps {
  wrappedData: WrappedData
  year: number
  isShared?: boolean
  userName?: string
  summary?: string
  shareToken?: string
  /** Playground preview: skip the intro transition and letterbox overlays. */
  isPreview?: boolean
}

export function WrappedViewerWrapper({
  wrappedData,
  year,
  isShared = false,
  userName,
  summary,
  shareToken,
  isPreview = false,
}: WrappedViewerWrapperProps) {
  // Skip transition for shared wraps and playground previews
  const [showTransition, setShowTransition] = useState(!isShared && !isPreview)

  const handleTransitionComplete = () => {
    setShowTransition(false)
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {showTransition ? (
          <WrappedTransition key="transition" year={year} onComplete={handleTransitionComplete} />
        ) : (
          <motion.div
            key="wrapped"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <WrappedViewer
              wrappedData={wrappedData}
              isShared={isShared}
              userName={userName}
              summary={summary}
              shareToken={shareToken}
              isPreview={isPreview}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

