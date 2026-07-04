"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ShareCardDownload } from "@/components/wrapped/share-card-download"
import { WrappedShareButton } from "@/components/wrapped/wrapped-share-button"

interface WrappedViewerNavigationProps {
  currentSectionIndex: number
  totalSections: number
  onPrevious: () => void
  onNext: () => void
  onShowAll: () => void
  isShared?: boolean
  shareToken?: string
  year: number
}

export function WrappedViewerNavigation({
  currentSectionIndex,
  totalSections,
  onPrevious,
  onNext,
  onShowAll,
  isShared,
  shareToken,
  year,
}: WrappedViewerNavigationProps) {
  return (
    <div className="mt-6 sm:mt-8 flex justify-between items-center gap-3">
      {currentSectionIndex > 0 ? (
        <button
          onClick={onPrevious}
          className="px-3 sm:px-4 py-2 bg-slate-800/50 border border-slate-600 rounded-md text-white hover:border-cyan-500 transition-colors text-sm sm:text-base"
        >
          Previous
        </button>
      ) : (
        <div />
      )}
      {!isShared && shareToken && currentSectionIndex === totalSections - 1 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: 0.6,
            type: "spring",
            stiffness: 200,
            damping: 15,
          }}
          className="flex-1 flex flex-wrap justify-center gap-3"
        >
          <WrappedShareButton
            shareToken={shareToken}
            year={year}
          />
          <ShareCardDownload shareToken={shareToken} year={year} />
        </motion.div>
      )}
      {currentSectionIndex < totalSections - 1 ? (
        <button
          onClick={onNext}
          className="px-3 sm:px-4 py-2 bg-slate-800/50 border border-slate-600 rounded-md text-white hover:border-cyan-500 transition-colors text-sm sm:text-base"
        >
          Next
        </button>
      ) : (
        <Button
          onClick={onShowAll}
          className="px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold shadow-lg border border-white/10"
        >
          Show All
        </Button>
      )}
    </div>
  )
}

