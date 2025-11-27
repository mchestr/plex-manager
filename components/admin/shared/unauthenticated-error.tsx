import { RexDinosaur } from "@/components/shared/rex-dinosaur"

export function UnauthenticatedError() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="relative flex items-center gap-8">
        {/* Rex mascot */}
        <div className="w-24 h-24 relative animate-bounce" style={{ animationDuration: "2s" }}>
          <RexDinosaur size="w-24 h-24" />
        </div>

        {/* 401 text */}
        <div className="text-9xl font-black text-white select-none">
          401
        </div>
      </div>
    </div>
  )
}

