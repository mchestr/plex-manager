"use client"

import { WrappedData, WrappedSection } from "@/types/wrapped"
import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import { SpaceBackground } from "./setup-wizard/space-background"
import { filterSections } from "./wrapped-section-filter"
import { SectionRenderer } from "./wrapped-sections"
import { WrappedViewerNavigation } from "./wrapped-viewer-navigation"
import { WrappedViewerProgress } from "./wrapped-viewer-progress"

interface WrappedViewerProps {
  wrappedData: WrappedData
  onComplete?: () => void
  isShared?: boolean
  userName?: string
  summary?: string
  shareToken?: string
}

export function WrappedViewer({
  wrappedData,
  onComplete,
  isShared = false,
  userName,
  summary,
  shareToken,
}: WrappedViewerProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sectionStartTime, setSectionStartTime] = useState(Date.now())
  const prevSectionIndexRef = useRef(currentSectionIndex)

  // Use refs to track sections and only update when content actually changes
  // This prevents infinite loops from array reference changes
  const sectionsKeyRef = useRef<string>("")
  const sectionsDataRef = useRef<WrappedSection[]>([])

  // Calculate current key from section IDs
  const allSections = wrappedData.sections || []
  const currentKey = JSON.stringify(allSections.filter(s => s && s.id).map(s => s.id).sort())

  // Only update sections if the actual section IDs changed
  if (sectionsKeyRef.current !== currentKey) {
    sectionsKeyRef.current = currentKey
    sectionsDataRef.current = filterSections(allSections)

    // Debug logging in development
    if (process.env.NODE_ENV === 'development' && allSections.length > 0 && sectionsDataRef.current.length === 0) {
      console.warn('[WrappedViewer] All sections filtered out!', {
        totalSections: allSections.length,
        sections: allSections.map(s => ({
          id: s?.id,
          type: s?.type,
          hasType: !!s?.type,
          typeValue: s?.type,
        })),
      })
    }
  }

  const sections = sectionsDataRef.current

  // Calculate delay for current section
  const getSectionDelay = useCallback((index: number) => {
    if (index >= sections.length - 1) return 0
    const currentSection = sections[index]
    if (!currentSection) return 8000
    const baseDelay = currentSection.animationDelay || 8000
    return index === 0
      ? baseDelay + 2000  // First section: 10s total (8s base + 2s buffer)
      : baseDelay + 4000   // Subsequent sections: 12s total (8s base + 4s buffer)
  }, [sections])

  // Update progress bar based on elapsed time
  useEffect(() => {
    if (showAll || !isAutoAdvancing || currentSectionIndex >= sections.length - 1) {
      setProgress(100)
      return
    }

    const delay = getSectionDelay(currentSectionIndex)
    if (delay === 0) {
      setProgress(100)
      return
    }

    const updateProgress = () => {
      const elapsed = Date.now() - sectionStartTime
      const progressPercent = Math.min((elapsed / delay) * 100, 100)
      setProgress(progressPercent)
    }

    // Don't update immediately - let the interval handle it to avoid unnecessary renders
    // Update every 50ms for smooth animation
    const interval = setInterval(updateProgress, 50)

    return () => clearInterval(interval)
  }, [currentSectionIndex, sectionStartTime, isAutoAdvancing, showAll, sections.length, getSectionDelay])

  // Update section start time only when section index actually changes
  useEffect(() => {
    if (prevSectionIndexRef.current !== currentSectionIndex) {
      setSectionStartTime(Date.now())
      setProgress(0)
      prevSectionIndexRef.current = currentSectionIndex
    }
  }, [currentSectionIndex])

  useEffect(() => {
    if (showAll) return

    if (isAutoAdvancing && currentSectionIndex < sections.length - 1) {
      const delay = getSectionDelay(currentSectionIndex)

      const timer = setTimeout(() => {
        setCurrentSectionIndex((prev) => prev + 1)
      }, delay)

      return () => clearTimeout(timer)
    } else if (currentSectionIndex >= sections.length - 1 && onComplete) {
      // Last section shown, call onComplete after a delay
      setProgress(100)
      const timer = setTimeout(() => {
        onComplete?.()
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [currentSectionIndex, sections.length, isAutoAdvancing, showAll, onComplete, getSectionDelay])

  const handleNext = () => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex((prev) => prev + 1)
      setIsAutoAdvancing(false)
    }
  }

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex((prev) => prev - 1)
      setIsAutoAdvancing(false)
    }
  }

  const handleShowAll = () => {
    setShowAll(true)
    setIsAutoAdvancing(false)
  }

  if (showAll) {
    return (
      <div className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
        <SpaceBackground />
        <div className="max-w-6xl mx-auto relative z-10 space-y-12">
          {sections.map((section, idx) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className="bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-8"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <SectionRenderer section={section} wrappedData={wrappedData} sectionIndex={idx} />
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  const currentSection = sections[currentSectionIndex]

  // Early return if no sections or current section is invalid
  // But first, log debug info if we have sections in wrappedData but none after filtering
  if (!sections.length) {
    if (allSections.length > 0) {
      console.warn('[WrappedViewer] Sections filtered out:', {
        totalSections: allSections.length,
        filteredSections: sections.length,
        sampleSection: allSections[0],
      })
    }
    return (
      <div className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
        <SpaceBackground />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-8 md:p-12 text-center">
            <p className="text-lg text-slate-300">No sections available to display</p>
            {process.env.NODE_ENV === 'development' && allSections.length > 0 && (
              <p className="text-sm text-slate-500 mt-2">
                Debug: {allSections.length} sections in data, but all were filtered out
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!currentSection) {
    return (
      <div className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
        <SpaceBackground />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-8 md:p-12 text-center">
            <p className="text-lg text-slate-300">Current section unavailable</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="max-w-4xl mx-auto relative z-10">
        <WrappedViewerProgress
          progress={progress}
          currentSectionIndex={currentSectionIndex}
          totalSections={sections.length}
        />

        {/* Section content */}
        <AnimatePresence mode="wait" onExitComplete={() => {}}>
          <motion.div
            key={`${currentSectionIndex}-${currentSection?.id || ''}`}
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            transition={{
              duration: 1.2,
              type: "spring",
              stiffness: 100,
              damping: 20
            }}
            className="bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-8 md:p-12"
            style={{ backdropFilter: "blur(8px)", minHeight: "60vh" }}
          >
            <SectionRenderer section={currentSection} wrappedData={wrappedData} sectionIndex={currentSectionIndex} />
          </motion.div>
        </AnimatePresence>

        <WrappedViewerNavigation
          currentSectionIndex={currentSectionIndex}
          totalSections={sections.length}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onShowAll={handleShowAll}
          isShared={isShared}
          shareToken={shareToken}
          year={wrappedData.year}
        />
      </div>
    </div>
  )
}
