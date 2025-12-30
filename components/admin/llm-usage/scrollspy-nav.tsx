"use client"

import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

interface ScrollspyNavProps {
  sections: Array<{ id: string; label: string }>
}

export function ScrollspyNav({ sections }: ScrollspyNavProps) {
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id || "")
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "-100px 0px -60% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    }

    const sectionElements: Array<{ id: string; element: HTMLElement; observer: IntersectionObserver }> = []

    sections.forEach((section) => {
      const element = document.getElementById(section.id)
      if (!element) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
              setActiveSection(section.id)
            }
          })
        },
        observerOptions
      )

      observer.observe(element)
      sectionElements.push({ id: section.id, element, observer })
    })

    // Fallback: check scroll position to determine active section
    const handleScroll = () => {
      setIsVisible(window.scrollY > 200)

      // Find which section is closest to the top of the viewport
      const scrollPosition = window.scrollY + 150 // Offset for header
      let currentSection = sections[0]?.id || ""

      for (let i = sections.length - 1; i >= 0; i--) {
        const element = document.getElementById(sections[i].id)
        if (element && element.offsetTop <= scrollPosition) {
          currentSection = sections[i].id
          break
        }
      }

      setActiveSection(currentSection)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll() // Initial check

    return () => {
      sectionElements.forEach(({ observer }) => observer.disconnect())
      window.removeEventListener("scroll", handleScroll)
    }
  }, [sections])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 80 // Account for any fixed headers
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
    }
  }

  return (
    <>
      {/* Mobile sticky nav */}
      <nav className="sticky top-0 z-40 lg:hidden bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 mb-6 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3">
        <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {sections.map((section) => {
            const isActive = activeSection === section.id
            return (
              <Button
                key={section.id}
                variant={isActive ? "primary" : "secondary"}
                size="sm"
                onClick={() => scrollToSection(section.id)}
                className="whitespace-nowrap"
              >
                {section.label}
              </Button>
            )
          })}
        </div>
      </nav>

      {/* Desktop fixed sidebar */}
      {isVisible && (
        <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-50 hidden lg:block">
          <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-lg">
            <div className="space-y-1">
              {sections.map((section) => {
                const isActive = activeSection === section.id
                return (
                  <Button
                    key={section.id}
                    variant={isActive ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => scrollToSection(section.id)}
                    className="w-full justify-start"
                  >
                    {section.label}
                  </Button>
                )
              })}
            </div>
          </div>
        </nav>
      )}
    </>
  )
}

