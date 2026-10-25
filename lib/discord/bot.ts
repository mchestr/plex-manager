import { createHash } from "crypto"
import { Client, Events, GatewayIntentBits, Partials } from "discord.js"
import { createLogger, type Logger } from "@/lib/utils/logger"
import { getDiscordBotToken, getDiscordPortalUrl, getSupportChannelId } from "./config"
import { FATAL_CLOSE_CODES, LoginGuard, type BlockedVerdict } from "./login-guard"
import { LoginLedger, recordGatewayDisconnect, recordGatewayHealth } from "./login-ledger"
import { routeInteraction } from "./routing/interaction-router"
import { routeDirectMessage, defaultDmRouteDeps } from "./routing/dm-router"

/**
 * Factory for the discord.js gateway client. Injectable so tests can supply a
 * fake client without a live gateway connection.
 *
 * The bot works purely via slash commands, component interactions, and the
 * DM-based assistant, so it needs only:
 * - `Guilds` — to serve slash-command / component `InteractionCreate` events.
 * - `DirectMessages` + `Partials.Channel` — to receive DM `messageCreate`
 *   events (discord.js needs the partial channel to emit them for DMs).
 *
 * DM message *content* is exempt from the `MessageContent` privileged intent, so
 * the DM assistant works without it. The `MessageContent` and `GuildMessages`
 * intents (which previously fed the removed `!`-prefix / channel-monitoring
 * handler) are intentionally NOT requested.
 */
export type DiscordClientFactory = () => Client

/** @internal */
export const defaultClientFactory: DiscordClientFactory = () =>
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  })

/** Gateway READY must hold this long before the login backoff resets. */
const STABLE_READY_MS = 60 * 1000

const HEALTH_MESSAGES = {
  fatal: "Discord rejected the bot's token or intents. Save a new token in Admin, Settings, Discord.",
  backoff: "The bot could not log in to Discord and is retrying with a growing delay.",
  daily_cap: "The bot hit its daily login limit and will not log in again until the count falls.",
} as const

export class DiscordBot {
  private client: Client | null = null
  private readonly logger: Logger
  private isInitialized = false
  private tokenId: string | null = null
  /** Reason and retry time of the last blocked login reported, so a tick that finds the same block stays quiet. */
  private lastBlocked: string | null = null
  private stableTimer: ReturnType<typeof setTimeout> | null = null
  private readonly createClient: DiscordClientFactory
  private readonly guard: LoginGuard

  /**
   * @param createClient - Factory that builds the discord.js Client. Defaults to
   *   a real client with the bot's gateway intents; inject a fake in tests.
   * @param logger - Where the bot logs. Defaults to the shared sanitising
   *   logger, so bot metadata is redacted like every other line (BP-37).
   * @param guard - Decides whether a login may happen now (backoff, fatal
   *   errors, daily cap). Defaults to one counting logins in the shared ledger.
   */
  constructor(
    createClient: DiscordClientFactory = defaultClientFactory,
    logger: Logger = createLogger("discord-bot"),
    guard: LoginGuard = new LoginGuard(new LoginLedger())
  ) {
    this.createClient = createClient
    this.logger = logger
    this.guard = guard
  }

  /** Whether a logged-in client is live. */
  get isActive(): boolean {
    return this.isInitialized
  }

  /**
   * Logs in, unless the login guard says wait. Never throws for a failed login:
   * the failure is logged, the failed client destroyed, and the guard decides
   * when the next attempt may happen (call again; it is cheap while blocked).
   *
   * Already logged in with the same token is a no-op, so a config change that
   * left the token alone keeps the gateway session. A different token destroys
   * the old client first, so one process never holds two.
   */
  async initialize(): Promise<void> {
    // Resolve config, preferring the DB row and falling back to env (see
    // lib/discord/config.ts). Only the bot token is required to start: support
    // is now DM-the-assistant + `/help` (FR-18), so the support channel is no
    // longer monitored and no longer gates startup. We still resolve it purely
    // for informational logging (it may inform a pinned post / link portal).
    const BOT_TOKEN = await getDiscordBotToken()
    if (!BOT_TOKEN) {
      this.logger.warn("Missing required Discord configuration, Discord bot will not start", {
        missing: ["botToken"],
      })
      return
    }

    const tokenId = createHash("sha256").update(BOT_TOKEN).digest("hex").slice(0, 12)
    if (this.isInitialized && this.tokenId === tokenId) {
      this.logger.debug("Discord bot already logged in with this token")
      return
    }
    await this.teardown()

    const verdict = await this.guard.check(tokenId)
    if (!verdict.allowed) {
      await this.reportBlocked(verdict)
      return
    }
    this.lastBlocked = null

    const SUPPORT_CHANNEL_ID = await getSupportChannelId()
    const PORTAL_URL = getDiscordPortalUrl()

    this.logger.info("Starting Discord bot", {
      supportChannelId: SUPPORT_CHANNEL_ID ?? null,
      hasBotToken: !!BOT_TOKEN,
    })

    const client = this.createClient()
    this.client = client
    this.tokenId = tokenId
    this.setupEventHandlers(PORTAL_URL, tokenId)

    try {
      await this.guard.recordAttempt()
      await client.login(BOT_TOKEN)
      this.isInitialized = true
      this.logger.info("Discord bot initialized successfully")
    } catch (error) {
      this.logger.error("Failed to login to Discord", error, { hasToken: !!BOT_TOKEN })
      await this.teardown()
      await this.reportBlocked(this.guard.recordFailure(error, tokenId))
    }
  }

  private async reportBlocked(verdict: BlockedVerdict): Promise<void> {
    const blocked = `${verdict.reason}:${verdict.retryAt}`
    if (blocked === this.lastBlocked) return
    this.lastBlocked = blocked
    const retryAt = verdict.retryAt ? new Date(verdict.retryAt).toISOString() : null
    if (verdict.reason === "backoff") {
      this.logger.warn("discord.login_backoff", { retryAt })
    } else {
      this.logger.error(`discord.login_${verdict.reason}`, undefined, { retryAt })
    }
    await recordGatewayHealth(verdict.reason, HEALTH_MESSAGES[verdict.reason])
  }

  private setupEventHandlers(PORTAL_URL: string, tokenId: string) {
    if (!this.client) return

    this.client.once(Events.ClientReady, (readyClient) => {
      this.stableTimer = setTimeout(() => {
        this.guard.recordReady()
        void recordGatewayHealth("ok", null)
      }, STABLE_READY_MS)
      this.stableTimer.unref()
      this.logger.info("Bot connected and ready", {
        botTag: readyClient.user.tag,
        botId: readyClient.user.id,
        guildCount: readyClient.guilds.cache.size,
      })
    })

    // The bot serves guild traffic exclusively through slash commands and
    // component interactions (see the InteractionCreate handler below). The only
    // messageCreate events we care about are DMs to the assistant; guild messages
    // are ignored (and, without the MessageContent intent, arrive empty anyway).
    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return
      if (message.guildId) return

      try {
        await routeDirectMessage(message, defaultDmRouteDeps(PORTAL_URL))
      } catch (error) {
        this.logger.error("Error routing direct message", error, {
          discordUserId: message.author.id,
          channelId: message.channelId,
        })
      }
    })

    // Handle slash-command / component interactions. Needs no gateway intent
    // beyond Guilds, which is already present.
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await routeInteraction(interaction)
      } catch (error) {
        this.logger.error("Error routing interaction", error, {
          interactionId: interaction.id,
          userId: interaction.user.id,
        })
      }
    })

    // Handle client errors
    this.client.on(Events.Error, (error) => {
      this.logger.error("Discord client error", error)
    })

    this.client.on(Events.Warn, (warning) => {
      this.logger.warn("Discord client warning", { warning })
    })

    this.client.on(Events.Debug, (info) => {
      this.logger.debug("Discord client debug", { info })
    })

    // Handle disconnects
    this.client.on(Events.ShardDisconnect, (event, shardId) => {
      this.logger.warn("Discord shard disconnected", {
        shardId,
        code: event.code,
        reason: event.reason,
      })
      void recordGatewayDisconnect(event.code)
      if (FATAL_CLOSE_CODES.has(event.code)) {
        // Discord will refuse this login again: stop, and wait for a new token.
        this.guard.recordFatalClose(tokenId)
        this.logger.error("discord.login_fatal", undefined, { code: event.code })
        void this.teardown().then(() => recordGatewayHealth("fatal", HEALTH_MESSAGES.fatal))
      }
    })

    this.client.on(Events.ShardReconnecting, (shardId) => {
      this.logger.info("Discord shard reconnecting", { shardId })
    })

    this.client.on(Events.ShardResume, (shardId, replayed) => {
      this.logger.info("Discord shard resumed", {
        shardId,
        replayedEvents: replayed,
      })
    })
  }

  async destroy(): Promise<void> {
    if (this.client) this.logger.info("Destroying Discord client")
    await this.teardown()
  }

  /** Destroys the client, live or half-started; safe to call with none. */
  private async teardown(): Promise<void> {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer)
      this.stableTimer = null
    }
    const client = this.client
    this.client = null
    this.isInitialized = false
    this.tokenId = null
    if (!client) return
    try {
      await client.destroy()
      this.logger.info("Discord client destroyed")
    } catch (error) {
      this.logger.warn("Discord client could not be destroyed cleanly", { error })
    }
  }
}
