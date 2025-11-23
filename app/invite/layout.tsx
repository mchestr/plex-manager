import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"
import React from "react"

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpaceBackground />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:p-24 pb-20 md:pb-24">
        {children}
      </main>
    </div>
  )
}

