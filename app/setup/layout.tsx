import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"
import React from "react"

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative py-12 px-4 sm:px-6 lg:px-8">
      <SpaceBackground />
      {children}
    </div>
  )
}

