import Link from "next/link"

import { Button } from "@/components/ui/button"
import { POSTCARD_TITLES_LABEL, postcardMinutes } from "@/lib/rewind/pages/postcard"
import type { PostcardData } from "@/lib/rewind/pages/postcard.schema"
import { postcardHeadline } from "@/lib/wrapped/copy/templates"
import { cn } from "@/lib/utils"

import { CopyText } from "./copy-text"
import { SentenceHeadline } from "./headline"
import type { PageProps } from "./issue-context"
import { ARTBOARD_PILL, ARTBOARD_TARGET, axes, stackGap, u, ut } from "./units"

/** Where "Browse the library" goes without a public Plex URL: Plex's own web app. @internal */
export const PLEX_WEB_APP = "https://app.plex.tv/desktop"

const label = { fontSize: ut(14) }

/**
 * The postcard (design 4.5): one paper page, "A quiet year on {server}",
 * the member's minutes when there are any (never "0 minutes"), up to three
 * titles that 3 or more members watched, with no names or counts, and
 * "Browse the library", which opens the server's Plex web app. It is the
 * whole issue, so it is also the end: "Done" goes back.
 */
export function PostcardPage({ data, issue }: PageProps<PostcardData>) {
  const minutes = postcardMinutes(issue.facts)
  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(16)}` }} data-testid="rewind-page-postcard">
      <SentenceHeadline text={postcardHeadline(issue.serverName)} />
      {minutes && (
        <p style={{ fontSize: u(18), lineHeight: 1.3, marginTop: u(12) }} data-testid="rewind-postcard-minutes">
          <CopyText text={minutes} source={issue.facts} />
        </p>
      )}
      {data.titles.length > 0 && (
        <section aria-labelledby="rewind-postcard-titles" className="border-t-[1.5px] border-current" style={{ marginTop: u(18), paddingTop: u(9) }}>
          <h3 id="rewind-postcard-titles" className="font-display" style={{ fontSize: ut(13), lineHeight: 1.2, fontVariationSettings: axes(100, 600) }}>
            {POSTCARD_TITLES_LABEL}
          </h3>
          <ul data-testid="rewind-postcard-titles">
            {data.titles.map((title) => (
              <li key={title.key} className="border-b border-current/40 italic" style={{ fontSize: u(18.5), lineHeight: 1.25, padding: `${u(7)} 0` }}>
                {title.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div data-rw-interactive className="mt-auto flex flex-col font-display" style={{ gap: stackGap(8), paddingTop: u(16) }}>
        <Button
          variant="ink"
          size="pill"
          nativeButton={false}
          render={<a href={issue.libraryHref ?? PLEX_WEB_APP} target="_blank" rel="noopener noreferrer" />}
          className={cn(ARTBOARD_PILL, "w-full")}
          style={label}
          data-testid="rewind-postcard-browse"
        >
          Browse the library
        </Button>
        <Button
          variant="link"
          nativeButton={false}
          render={<Link href={issue.returnTo} />}
          className={cn(ARTBOARD_TARGET, "h-[calc(var(--u)*44px)] px-0 font-semibold")}
          style={label}
          data-testid="rewind-done"
        >
          Done
        </Button>
      </div>
    </div>
  )
}
