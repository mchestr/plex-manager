import { Client, Events, GatewayIntentBits, Partials } from "discord.js"
import winston from "winston"
import { getDiscordBotToken, getSupportChannelId } from "./config"
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

export const defaultClientFactory: DiscordClientFactory = () =>
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  })

export class DiscordBot {
  private client: Client | null = null
  private logger: winston.Logger
  private isInitialized = false
  private readonly createClient: DiscordClientFactory

  /**
   * @param createClient - Factory that builds the discord.js Client. Defaults to
   *   a real client with the bot's gateway intents; inject a fake in tests.
   */
  constructor(createClient: DiscordClientFactory = defaultClientFactory) {
    this.createClient = createClient
    const isDevelopment = process.env.NODE_ENV === "development" || !process.env.NODE_ENV

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        isDevelopment
          ? winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const levelSymbol = {
                error: "✖",
                warn: "⚠",
                info: "ℹ",
                debug: "→",
              }[level] || "•"
              const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ""
              return `${timestamp} ${levelSymbol} ${level.toUpperCase().padEnd(5)} [discord-bot] ${message}${metaStr}`
            })
          : winston.format.json()
      ),
      defaultMeta: {
        service: "discord-bot",
        env: process.env.NODE_ENV || "development",
      },
      transports: [
        new winston.transports.Console({
          stderrLevels: ["error"],
        }),
      ],
      exitOnError: false,
    })
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn("Discord bot already initialized")
      return
    }

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
    const SUPPORT_CHANNEL_ID = await getSupportChannelId()
    const BASE_URL = process.env.PLEX_WRAPPED_BASE_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
    const PORTAL_URL = process.env.DISCORD_PORTAL_URL || `${BASE_URL}/discord/link`

    this.logger.info("Starting Discord bot", {
      supportChannelId: SUPPORT_CHANNEL_ID ?? null,
      hasBotToken: !!BOT_TOKEN,
    })

    this.client = this.createClient()

    // Set up event handlers (BOT_TOKEN is guaranteed non-null by the check
    // above).
    this.setupEventHandlers(PORTAL_URL)

    // Login to Discord
    try {
      await this.client.login(BOT_TOKEN!)
      this.isInitialized = true
      this.logger.info("Discord bot initialized successfully")
    } catch (error) {
      this.logger.error("Failed to login to Discord", error, {
        hasToken: !!BOT_TOKEN,
      })
      throw error
    }
  }

  private setupEventHandlers(PORTAL_URL: string) {
    if (!this.client) return

    this.client.once(Events.ClientReady, (readyClient) => {
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
    if (this.client) {
      this.logger.info("Destroying Discord client")
      await this.client.destroy()
      this.client = null
      this.isInitialized = false
      this.logger.info("Discord client destroyed")
    }
  }
}
