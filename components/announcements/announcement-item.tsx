import { NewPip } from "@/components/announcements/new-pip"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { Time } from "@/components/ui/time"

interface AnnouncementItemProps {
  announcement: { id: string; title: string; content: string; createdAt: string }
  /** Posted since the member last looked (`isNewAnnouncement`): the "New" pip. */
  isNew: boolean
  /** `h2` on the announcements page, `h3` under another heading. */
  as?: "h2" | "h3"
  "data-testid"?: string
}

/**
 * One announcement as members see it (UI-25): the "New" pip from read state,
 * the title, the date and the Markdown body through `MarkdownBody`, never
 * clipped. The admin dialog's live preview renders this same component.
 */
export function AnnouncementItem({ announcement, isNew, as: Heading = "h2", ...props }: AnnouncementItemProps) {
  const testId = props["data-testid"] ?? `announcement-${announcement.id}`
  const titleId = `${testId}-title`
  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex items-center gap-2">
        {isNew && <NewPip data-testid={`${testId}-new`} />}
        <Heading id={titleId} className="text-h3 text-foreground">
          {announcement.title}
        </Heading>
      </div>
      <Time value={announcement.createdAt} className="text-caption text-muted-foreground" />
      <MarkdownBody className="text-ui text-foreground">{announcement.content}</MarkdownBody>
    </article>
  )
}
