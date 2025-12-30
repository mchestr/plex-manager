"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface PromptMessage {
  id: string
  role: string
  name?: string
  index: number
}

interface PromptScrollspyProps {
  messages: PromptMessage[]
  containerId: string
}

export function PromptScrollspy({ messages, containerId }: PromptScrollspyProps) {
  const [activeMessage, setActiveMessage] = useState<string>(messages[0]?.id || "")

  useEffect(() => {
    if (messages.length === 0) return

    const container = document.getElementById(containerId)
    if (!container) return

    const observerOptions = {
      root: container,
      rootMargin: "-20% 0px -60% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    }

    const observers = messages.map((message) => {
      const element = document.getElementById(message.id)
      if (!element) return null

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
              setActiveMessage(message.id)
            }
          })
        },
        observerOptions
      )

      observer.observe(element)
      return observer
    })

    // Fallback: check scroll position within container
    const handleScroll = () => {
      const scrollPosition = container.scrollTop + 100
      let currentMessage = messages[0]?.id || ""

      for (let i = messages.length - 1; i >= 0; i--) {
        const element = document.getElementById(messages[i].id)
        if (element && element.offsetTop <= scrollPosition) {
          currentMessage = messages[i].id
          break
        }
      }

      setActiveMessage(currentMessage)
    }

    container.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll() // Initial check

    return () => {
      observers.forEach((observer) => observer?.disconnect())
      container.removeEventListener("scroll", handleScroll)
    }
  }, [messages, containerId])

  const scrollToMessage = (id: string) => {
    const element = document.getElementById(id)
    const container = document.getElementById(containerId)
    if (element && container) {
      const offset = 20
      const elementPosition = element.getBoundingClientRect().top
      const containerPosition = container.getBoundingClientRect().top
      const offsetPosition = elementPosition - containerPosition + container.scrollTop - offset

      container.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })
    }
  }

  if (messages.length <= 1) return null

  const roleColors: Record<string, { text: string; bg: string }> = {
    SYSTEM: { text: "text-purple-400", bg: "bg-purple-500/20" },
    USER: { text: "text-blue-400", bg: "bg-blue-500/20" },
    ASSISTANT: { text: "text-green-400", bg: "bg-green-500/20" },
    TOOL: { text: "text-yellow-400", bg: "bg-yellow-500/20" },
  }

  return (
    <div className="mb-3 pb-3 border-b border-slate-700">
      <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {messages.map((message) => {
          const isActive = activeMessage === message.id
          const colors = roleColors[message.role] || { text: "text-slate-400", bg: "bg-slate-700/20" }
          const label = message.name ? `${message.role} (${message.name})` : message.role

          return (
            <Button
              key={message.id}
              onClick={() => scrollToMessage(message.id)}
              variant="ghost"
              size="sm"
              className={`whitespace-nowrap ${
                isActive
                  ? `${colors.bg} ${colors.text} font-medium`
                  : "bg-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50"
              }`}
            >
              {label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

