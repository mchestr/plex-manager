import type { AuthService } from "@/types/onboarding"

interface PlaybackGuideProps {
  /** The member's media service; the steps name only its own app and settings. */
  service: AuthService
  /** The media server's name, as the member knows it. */
  serverName: string
}

const STEPS: Record<AuthService, { app: string; steps: string[] }> = {
  plex: {
    app: "Plex",
    steps: [
      "Open Settings in the Plex app on your device.",
      "Go to Video (Quality on some apps).",
      "Set Remote Streaming (or Internet Streaming) to Maximum or Original.",
      "Turn off Adjust Automatically.",
    ],
  },
  jellyfin: {
    app: "Jellyfin",
    steps: [
      "Open Settings in the Jellyfin app on your device.",
      "Go to Playback, then Quality.",
      "Set Internet streaming quality to Maximum.",
      "Turn off Auto adjust quality.",
    ],
  },
}

/**
 * How to stop the app capping quality (6.1), for the member's own service.
 * Shared by Help and onboarding; it renders no heading, so each host sets its
 * own level. Server-safe: no hooks and no server imports.
 */
export function PlaybackGuide({ service, serverName }: PlaybackGuideProps) {
  const { app, steps } = STEPS[service]
  return (
    <div className="flex flex-col gap-3 text-ui text-foreground" data-testid="playback-guide">
      <p className="text-muted-foreground">
        Some {app} apps set video to 720p by default. Then {serverName} must convert the video while you watch. This
        lowers the quality and can cause buffering.
      </p>
      <ol className="flex list-decimal flex-col gap-2 pl-5" data-testid="playback-guide-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-caption text-muted-foreground">
        The names are a little different on TV, phone and web apps. Look for the quality or playback settings.
      </p>
    </div>
  )
}
