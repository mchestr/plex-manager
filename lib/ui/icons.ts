/**
 * One lucide glyph per concept (ui-design-system 3.10). Render them through
 * `<Icon icon={icons.users} />`, which sets the size and stroke.
 *
 * Services are generic glyphs, never brand marks or brand colours (UI Q9).
 *
 * @module lib/ui/icons
 */

import {
  Activity,
  ArrowUpRight,
  Bot,
  Calendar,
  ChartLine,
  Check,
  CircleCheck,
  CircleDashed,
  CirclePlus,
  CircleX,
  Clock,
  Coins,
  FileText,
  Film,
  FlaskConical,
  Gauge,
  Info,
  Layers,
  LayoutDashboard,
  Lock,
  Megaphone,
  MessagesSquare,
  Pause,
  Play,
  Plug,
  Rewind,
  Server,
  Settings,
  Shield,
  Ticket,
  TriangleAlert,
  Tv,
  TvMinimal,
  Users,
  type LucideIcon,
} from "lucide-react"

export const icons = {
  // Services
  plex: Tv,
  requests: CirclePlus,
  discord: MessagesSquare,
  discordBot: Bot,
  tautulli: ChartLine,
  sonarr: TvMinimal,
  radarr: Film,
  jellyfin: Server,
  prometheus: Gauge,
  // Areas
  rewind: Rewind,
  rewindOpen: Play,
  invites: Ticket,
  users: Users,
  announcements: Megaphone,
  prompts: FileText,
  playground: FlaskConical,
  llmUsage: Activity,
  cost: Coins,
  queues: Layers,
  settings: Settings,
  overview: LayoutDashboard,
  // Actions and states
  externalLink: ArrowUpRight,
  testConnection: Plug,
  savedSecret: Lock,
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  done: Check,
  paused: Pause,
  pending: Clock,
  scheduled: Calendar,
  owner: Shield,
  notChecked: CircleDashed,
} as const satisfies Record<string, LucideIcon>
