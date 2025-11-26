import { LoadingScreen } from "@/components/ui/loading-screen"

export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <LoadingScreen message="Loading your Wrapped..." />
    </main>
  )
}

