import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import type { AuthService } from "@/types/onboarding"

const LABELS: Record<AuthService, { app: string; path: string[]; quality: string; qualityHint: string; auto: string; home: string }> = {
  plex: {
    app: "Plex app",
    path: ["Settings", "Quality"],
    quality: "Remote streaming",
    qualityHint: "Some apps call it Internet streaming",
    auto: "Adjust automatically",
    home: "Home streaming",
  },
  jellyfin: {
    app: "Jellyfin app",
    path: ["Settings", "Playback"],
    quality: "Internet streaming quality",
    qualityHint: "Some apps call it Maximum streaming bitrate",
    auto: "Auto adjust quality",
    home: "Home network quality",
  },
}

/**
 * A mock of the app's quality settings (ui-design-system 6.5): "720p" struck
 * through and "Maximum" checked, the changed row marked by a 3px
 * `border-strong` strip on `muted`, never amber. Decorative: the guide's
 * numbered steps say the same in text.
 */
export function PlaybackIllustration({ service }: { service: AuthService }) {
  const labels = LABELS[service]
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-lg border border-border-strong bg-background" data-testid="playback-illustration">
      <div className="flex items-center gap-1.5 border-b px-3.5 py-2.5 text-caption font-normal text-muted-foreground">
        {labels.app}
        {labels.path.map((part) => (
          <span key={part} className="flex items-center gap-1.5">
            <Icon icon={icons.chevronRight} size={12} />
            {part}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-b bg-muted px-3.5 py-3 text-ui shadow-[inset_3px_0_0_var(--border-strong)]">
        <div className="min-w-0">
          <p>{labels.quality}</p>
          <p className="text-caption font-normal text-muted-foreground">{labels.qualityHint}</p>
        </div>
        <p className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span className="text-label font-normal text-muted-foreground line-through decoration-[1.5px]">720p</span>
          <span className="flex items-center gap-1.5 font-semibold">
            Maximum
            <Icon icon={icons.done} size={14} className="text-success" />
          </span>
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-b px-3.5 py-3 text-ui">
        <p>{labels.auto}</p>
        <span className="inline-block h-5 w-9 shrink-0 rounded-full border border-input bg-secondary p-0.5">
          <span className="block size-3.5 rounded-full bg-muted-foreground" />
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-3.5 py-3 text-ui">
        <p>{labels.home}</p>
        <p className="font-medium">Original</p>
      </div>
    </div>
  )
}
