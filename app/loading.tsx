import { LoadingScreen } from "@/components/ui/loading-screen"

export default function Loading() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 outline-none">
      <LoadingScreen message="Loading Plex Manager..." />
    </main>
  )
}

