"use client"

import { WrappedData, WrappedSection } from "@/types/wrapped"
import { AnimatePresence, motion } from "motion/react"
import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"
import { CinematicBackground } from "@/components/wrapped/cinematic/cinematic-background"
import { getSlideDuration } from "@/components/wrapped/cinematic/theme"
import { filterSections } from "@/components/wrapped/wrapped-section-filter"
import { SectionRenderer } from "@/components/wrapped/wrapped-sections"
import { WrappedViewerNavigation } from "@/components/wrapped/wrapped-viewer-navigation"
import { WrappedViewerProgress } from "@/components/wrapped/wrapped-viewer-progress"

interface WrappedViewerProps {
  wrappedData: WrappedData
  onComplete?: () => void
  isShared?: boolean
  userName?: string
  summary?: string
  shareToken?: string
  /**
   * The owner's share-link controls, shown on the last slide and under
   * "Show all". Never shown in a shared view.
   */
  shareControls?: ReactNode
  /** Playground preview: letterbox bars are disabled inside the scrollable modal. */
  isPreview?: boolean
}

export function WrappedViewer({
  wrappedData,
  onComplete,
  isShared = false,
  shareToken,
  shareControls,
  isPreview = false,
}: WrappedViewerProps) {
  const ownerShareControls = isShared ? undefined : shareControls
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sectionStartTime, setSectionStartTime] = useState(() => Date.now())

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
  const isCinematic = wrappedData.version === 2

  // Calculate delay for current section. v2: pacing is owned by the viewer,
  // derived from slide type. v1: honor the stored animationDelay.
  const getSectionDelay = useCallback((index: number) => {
    if (index >= sections.length - 1) return 0
    const currentSection = sections[index]
    if (!currentSection) return 8000
    if (isCinematic) {
      return getSlideDuration(currentSection.type)
    }
    const baseDelay = currentSection.animationDelay || 8000
    return index === 0
      ? baseDelay + 2000  // First section: 10s total (8s base + 2s buffer)
      : baseDelay + 4000   // Subsequent sections: 12s total (8s base + 4s buffer)
  }, [sections, isCinematic])

  // The bar is full whenever nothing is auto-advancing.
  const progressComplete =
    showAll ||
    !isAutoAdvancing ||
    currentSectionIndex >= sections.length - 1 ||
    getSectionDelay(currentSectionIndex) === 0

  const goToSection = useCallback((index: number) => {
    setCurrentSectionIndex(index)
    setSectionStartTime(Date.now())
    setProgress(0)
  }, [])

  // Update progress bar based on elapsed time
  useEffect(() => {
    if (progressComplete) return

    const delay = getSectionDelay(currentSectionIndex)

    const updateProgress = () => {
      const elapsed = Date.now() - sectionStartTime
      const progressPercent = Math.min((elapsed / delay) * 100, 100)
      setProgress(progressPercent)
    }

    // Don't update immediately - let the interval handle it to avoid unnecessary renders
    // Update every 50ms for smooth animation
    const interval = setInterval(updateProgress, 50)

    return () => clearInterval(interval)
  }, [currentSectionIndex, sectionStartTime, progressComplete, getSectionDelay])

  useEffect(() => {
    if (showAll) return

    if (isAutoAdvancing && currentSectionIndex < sections.length - 1) {
      const delay = getSectionDelay(currentSectionIndex)

      const timer = setTimeout(() => {
        goToSection(currentSectionIndex + 1)
      }, delay)

      return () => clearTimeout(timer)
    } else if (currentSectionIndex >= sections.length - 1 && onComplete) {
      // Last section shown, call onComplete after a delay
      const timer = setTimeout(() => {
        onComplete?.()
      }, 10000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [currentSectionIndex, sections.length, isAutoAdvancing, showAll, onComplete, getSectionDelay, goToSection])

  const handleNext = () => {
    if (currentSectionIndex < sections.length - 1) {
      goToSection(currentSectionIndex + 1)
      setIsAutoAdvancing(false)
    }
  }

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      goToSection(currentSectionIndex - 1)
      setIsAutoAdvancing(false)
    }
  }

  const handleShowAll = () => {
    setShowAll(true)
    setIsAutoAdvancing(false)
  }

  if (showAll) {
    return (
      <div data-testid="wrapped-viewer" className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
        {isCinematic ? <CinematicBackground letterbox={false} /> : <SpaceBackground />}
        <div className="max-w-6xl mx-auto relative z-10 space-y-12">
          {sections.map((section, idx) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className={isCinematic
                ? "bg-stage-panel/60 border border-gold/15 shadow-2xl rounded-lg p-8"
                : "bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-8"}
              style={{ backdropFilter: "blur(8px)" }}
            >
              <SectionRenderer section={section} wrappedData={wrappedData} sectionIndex={idx} shareToken={shareToken} />
            </motion.div>
          ))}
          {ownerShareControls && (
            <div className="flex flex-wrap justify-center gap-3">{ownerShareControls}</div>
          )}
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
      <div data-testid="wrapped-viewer" className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
        {isCinematic ? <CinematicBackground /> : <SpaceBackground />}
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
      <div data-testid="wrapped-viewer" className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
        {isCinematic ? <CinematicBackground /> : <SpaceBackground />}
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-8 md:p-12 text-center">
            <p className="text-lg text-slate-300">Current section unavailable</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="wrapped-viewer" className="min-h-screen relative py-8 sm:py-12 px-4 sm:px-6 lg:px-8 pb-24 md:pb-12">
      {isCinematic ? <CinematicBackground letterbox={!isPreview} /> : <SpaceBackground />}
      <div className="max-w-4xl mx-auto relative z-10">
        <WrappedViewerProgress
          progress={progressComplete ? 100 : progress}
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
            className={isCinematic
              ? "bg-transparent rounded-lg p-6 sm:p-8 md:p-12 flex flex-col justify-center"
              : "bg-slate-900/90 border border-cyan-500/20 shadow-2xl rounded-lg p-6 sm:p-8 md:p-12"}
            style={isCinematic ? { minHeight: "60vh" } : { backdropFilter: "blur(8px)", minHeight: "50vh" }}
          >
            <SectionRenderer section={currentSection} wrappedData={wrappedData} sectionIndex={currentSectionIndex} shareToken={shareToken} />
          </motion.div>
        </AnimatePresence>

        <WrappedViewerNavigation
          currentSectionIndex={currentSectionIndex}
          totalSections={sections.length}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onShowAll={handleShowAll}
          shareControls={ownerShareControls}
        />
      </div>
    </div>
  )
}
