import { Client, Events, GatewayIntentBits } from "discord.js"
import winston from "winston"
import { clearDiscordChat, handleDiscordChat, verifyDiscordUser } from "./services"
import { MARK_COMMANDS, handleMarkCommand, handleSelectionResponse } from "./commands/media-marking"
import { HELP_COMMANDS, handleHelpCommand } from "./commands/help"
import {
  createCommandLog,
  updateCommandLog,
  logCommandExecution,
} from "./audit"
import type { DiscordCommandType, DiscordCommandStatus } from "@/lib/generated/prisma/client"

const REQUIRED_ENV = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_SUPPORT_CHANNEL_ID",
]

const CHAT_TRIGGER_PREFIXES = ["!assistant", "!bot", "!support"]
const CLEAR_COMMANDS = ["!clear", "!reset", "!clearcontext"]

export class DiscordBot {
  private client: Client | null = null
  private logger: winston.Logger
  private isInitialized = false

  constructor() {
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

    // Check required environment variables
    const missing = REQUIRED_ENV.filter((key) => !process.env[key])
    if (missing.length > 0) {
      this.logger.warn("Missing required environment variables, Discord bot will not start", { missing })
      return
    }

    const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
    const SUPPORT_CHANNEL_ID = process.env.DISCORD_SUPPORT_CHANNEL_ID!
    const BASE_URL = process.env.PLEX_WRAPPED_BASE_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
    const PORTAL_URL = process.env.DISCORD_PORTAL_URL || `${BASE_URL}/discord/link`
    const LISTEN_THREAD_IDS = process.env.DISCORD_SUPPORT_THREAD_IDS
      ? process.env.DISCORD_SUPPORT_THREAD_IDS.split(",").map((id) => id.trim()).filter(Boolean)
      : []

    this.logger.info("Starting Discord bot", {
      supportChannelId: SUPPORT_CHANNEL_ID,
      threadIds: LISTEN_THREAD_IDS,
      hasBotToken: !!BOT_TOKEN,
    })

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    })

    // Set up event handlers
    this.setupEventHandlers(SUPPORT_CHANNEL_ID, LISTEN_THREAD_IDS, PORTAL_URL)

    // Login to Discord
    try {
      await this.client.login(BOT_TOKEN)
      this.isInitialized = true
      this.logger.info("Discord bot initialized successfully")
    } catch (error) {
      this.logger.error("Failed to login to Discord", error, {
        hasToken: !!BOT_TOKEN,
      })
      throw error
    }
  }

  private setupEventHandlers(
    SUPPORT_CHANNEL_ID: string,
    LISTEN_THREAD_IDS: string[],
    PORTAL_URL: string
  ) {
    if (!this.client) return

    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.info("Bot connected and ready", {
        botTag: readyClient.user.tag,
        botId: readyClient.user.id,
        supportChannelId: SUPPORT_CHANNEL_ID,
        threadIds: LISTEN_THREAD_IDS,
        guildCount: readyClient.guilds.cache.size,
      })
    })

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) {
        this.logger.debug("Ignoring bot message", {
          authorId: message.author.id,
          authorTag: message.author.tag,
        })
        return
      }

      const isDm = !message.guildId
      const isSupportChannel = message.channelId === SUPPORT_CHANNEL_ID
      const isAllowedThread = LISTEN_THREAD_IDS.includes(message.channelId)
      const channelType = isDm ? "dm" : isSupportChannel ? "support-channel" : "thread"
      const botId = this.client?.user?.id ?? null
      const mentionBot = botId ? message.mentions.has(botId) : false
      const normalizedContent = message.content?.trim().toLowerCase() || ""
      const prefixUsed = Boolean(normalizedContent) && CHAT_TRIGGER_PREFIXES.some((prefix) => normalizedContent.startsWith(prefix))
      const shouldUseChatbot = isDm || mentionBot || prefixUsed

      if (!isDm && !isSupportChannel && !isAllowedThread) {
        this.logger.debug("Message not in monitored channel", {
          channelId: message.channelId,
          guildId: message.guildId,
          authorId: message.author.id,
        })
        return
      }

      this.logger.info("Message received in monitored channel", {
        channelId: message.channelId,
        channelType,
        authorId: message.author.id,
        authorTag: message.author.tag,
        messageLength: message.content?.length || 0,
        hasAttachments: message.attachments.size > 0,
        mentionBot,
        prefixUsed,
      })

      // Helper to create base audit log params
      const createAuditParams = (commandType: DiscordCommandType, commandName: string, commandArgs?: string) => ({
        discordUserId: message.author.id,
        discordUsername: message.author.tag,
        channelId: message.channelId,
        channelType,
        guildId: message.guildId ?? undefined,
        commandType,
        commandName,
        commandArgs,
      })

      try {
        const verification = await verifyDiscordUser(message.author.id)

        if (!verification.linked) {
          this.logger.info("User not linked, sending link request", {
            discordUserId: message.author.id,
            discordUserTag: message.author.tag,
          })
          // Log link request
          const startTime = Date.now()
          await logCommandExecution({
            ...createAuditParams("LINK_REQUEST" as DiscordCommandType, "link_request"),
            status: "SUCCESS" as DiscordCommandStatus,
            responseTimeMs: Date.now() - startTime,
          })
          await message.reply({
            content: `Hi <@${message.author.id}>! To talk with support, please link your account first: ${PORTAL_URL}`,
            allowedMentions: { users: [message.author.id] },
          })
          return
        }

        const displayName = verification.user?.name || verification.user?.email || `User ${verification.user?.id ?? "unknown"}`
        const userId = verification.user?.id

        this.logger.info("User verified successfully", {
          discordUserId: message.author.id,
          discordUserTag: message.author.tag,
          userId: verification.user?.id,
          userName: verification.user?.name,
          userEmail: verification.user?.email,
        })

        // Check for clear context command
        const isClearCommand = CLEAR_COMMANDS.some((cmd) => normalizedContent === cmd || normalizedContent.startsWith(`${cmd} `))
        if (isClearCommand) {
          const startTime = Date.now()
          const commandName = CLEAR_COMMANDS.find((cmd) => normalizedContent.startsWith(cmd)) || "!clear"
          const auditLog = await createCommandLog({
            ...createAuditParams("CLEAR_CONTEXT" as DiscordCommandType, commandName),
            userId,
          })
          try {
            const clearResponse = await clearDiscordChat({
              discordUserId: message.author.id,
              channelId: message.channelId,
            })

            if (clearResponse.success) {
              if (auditLog) {
                await updateCommandLog(auditLog.id, {
                  status: "SUCCESS" as DiscordCommandStatus,
                  responseTimeMs: Date.now() - startTime,
                })
              }
              await message.reply({
                content: "✅ Chat context cleared! Starting fresh.",
                allowedMentions: { users: [message.author.id] },
              })
            } else {
              if (auditLog) {
                await updateCommandLog(auditLog.id, {
                  status: "FAILED" as DiscordCommandStatus,
                  error: "Clear response returned failure",
                  responseTimeMs: Date.now() - startTime,
                })
              }
              await message.reply({
                content: "Sorry, I couldn't clear the chat context right now. Please try again in a moment.",
                allowedMentions: { users: [message.author.id] },
              })
            }
            return
          } catch (error) {
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "FAILED" as DiscordCommandStatus,
                error: error instanceof Error ? error.message : "Unknown error",
                responseTimeMs: Date.now() - startTime,
              })
            }
            this.logger.error("Error clearing chat context", error, {
              discordUserId: message.author.id,
              channelId: message.channelId,
            })
            await message.reply({
              content: "Sorry, I couldn't clear the chat context right now. Please try again in a moment.",
              allowedMentions: { users: [message.author.id] },
            })
            return
          }
        }

        // Check for help command
        const isHelpCommand = HELP_COMMANDS.some((cmd) => normalizedContent === cmd || normalizedContent.startsWith(`${cmd} `))
        if (isHelpCommand) {
          const args = message.content.trim().split(/\s+/).slice(1)
          const startTime = Date.now()
          const commandName = HELP_COMMANDS.find((cmd) => normalizedContent.startsWith(cmd)) || "!help"
          const auditLog = await createCommandLog({
            ...createAuditParams("HELP" as DiscordCommandType, commandName, args.join(" ")),
            userId,
          })
          try {
            await handleHelpCommand(message, args)
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "SUCCESS" as DiscordCommandStatus,
                responseTimeMs: Date.now() - startTime,
              })
            }
            return
          } catch (error) {
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "FAILED" as DiscordCommandStatus,
                error: error instanceof Error ? error.message : "Unknown error",
                responseTimeMs: Date.now() - startTime,
              })
            }
            this.logger.error("Error handling help command", error, {
              discordUserId: message.author.id,
              channelId: message.channelId,
              command: commandName,
            })
            await message.reply({
              content: "Sorry, I couldn't display the help information right now. Please try again in a moment.",
              allowedMentions: { users: [message.author.id] },
            })
            return
          }
        }

        // Check for media marking commands
        const firstWord = normalizedContent.split(/\s+/)[0]
        const isMarkCommand = Object.keys(MARK_COMMANDS).includes(firstWord)
        if (isMarkCommand) {
          const args = message.content.trim().split(/\s+/).slice(1)
          const startTime = Date.now()
          const auditLog = await createCommandLog({
            ...createAuditParams("MEDIA_MARK" as DiscordCommandType, firstWord, args.join(" ")),
            userId,
          })
          try {
            await handleMarkCommand(message, firstWord, args)
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "SUCCESS" as DiscordCommandStatus,
                responseTimeMs: Date.now() - startTime,
              })
            }
            return
          } catch (error) {
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "FAILED" as DiscordCommandStatus,
                error: error instanceof Error ? error.message : "Unknown error",
                responseTimeMs: Date.now() - startTime,
              })
            }
            this.logger.error("Error handling mark command", error, {
              discordUserId: message.author.id,
              channelId: message.channelId,
              command: firstWord,
            })
            await message.reply({
              content: "Sorry, I couldn't process your mark command right now. Please try again in a moment.",
              allowedMentions: { users: [message.author.id] },
            })
            return
          }
        }

        // Check for numeric selection responses (1-5)
        const trimmedContent = message.content.trim()
        if (/^[1-5]$/.test(trimmedContent)) {
          const selection = parseInt(trimmedContent, 10)
          const startTime = Date.now()
          const auditLog = await createCommandLog({
            ...createAuditParams("SELECTION" as DiscordCommandType, "selection", trimmedContent),
            userId,
          })
          try {
            const handled = await handleSelectionResponse(message, selection)
            if (handled) {
              if (auditLog) {
                await updateCommandLog(auditLog.id, {
                  status: "SUCCESS" as DiscordCommandStatus,
                  responseTimeMs: Date.now() - startTime,
                })
              }
              return
            }
            // If not handled, fall through to chatbot - update log status
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "SUCCESS" as DiscordCommandStatus,
                error: "No active selection context, falling through to chatbot",
                responseTimeMs: Date.now() - startTime,
              })
            }
          } catch (error) {
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "FAILED" as DiscordCommandStatus,
                error: error instanceof Error ? error.message : "Unknown error",
                responseTimeMs: Date.now() - startTime,
              })
            }
            this.logger.error("Error handling selection response", error, {
              discordUserId: message.author.id,
              channelId: message.channelId,
              selection,
            })
            // Fall through to chatbot if selection handling fails
          }
        }

        if (shouldUseChatbot) {
          const chatInput = this.buildChatInput({
            content: message.content ?? "",
            attachments: Array.from(message.attachments.values()),
            botId,
          })

          if (!chatInput) {
            this.logger.info("No actionable content for chatbot", {
              discordUserId: message.author.id,
              channelId: message.channelId,
            })
            await message.reply({
              content: "I didn't catch a question. Please include a message or attachment so I can help.",
              allowedMentions: { users: [message.author.id] },
            })
            return
          }

          const startTime = Date.now()
          // Determine the command name based on trigger type
          let commandName = "dm"
          if (mentionBot) {
            commandName = "@mention"
          } else if (prefixUsed) {
            commandName = CHAT_TRIGGER_PREFIXES.find((p) => normalizedContent.startsWith(p)) || "!assistant"
          }
          const auditLog = await createCommandLog({
            ...createAuditParams("CHAT" as DiscordCommandType, commandName, chatInput.substring(0, 500)),
            userId,
          })

          try {
            await message.channel.sendTyping().catch(() => {})
            const chatbotResponse = await handleDiscordChat({
              discordUserId: message.author.id,
              channelId: message.channelId,
              message: chatInput,
            })

            if (chatbotResponse.linked === false) {
              if (auditLog) {
                await updateCommandLog(auditLog.id, {
                  status: "SUCCESS" as DiscordCommandStatus,
                  error: "User not linked",
                  responseTimeMs: Date.now() - startTime,
                })
              }
              await message.reply({
                content: `Hi <@${message.author.id}>! To talk with support, please link your account first: ${PORTAL_URL}`,
                allowedMentions: { users: [message.author.id] },
              })
              return
            }

            if (!chatbotResponse.success || !chatbotResponse.message?.content) {
              throw new Error(chatbotResponse.error || "Empty chatbot response")
            }

            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "SUCCESS" as DiscordCommandStatus,
                responseTimeMs: Date.now() - startTime,
              })
            }

            const replyContent = isDm
              ? chatbotResponse.message.content
              : `<@${message.author.id}> ${chatbotResponse.message.content}`

            await message.reply({
              content: replyContent,
              allowedMentions: { users: [message.author.id] },
            })
            return
          } catch (error) {
            if (auditLog) {
              await updateCommandLog(auditLog.id, {
                status: "FAILED" as DiscordCommandStatus,
                error: error instanceof Error ? error.message : "Unknown error",
                responseTimeMs: Date.now() - startTime,
              })
            }
            this.logger.error("Error responding with chatbot", error, {
              discordUserId: message.author.id,
              channelId: message.channelId,
              channelType,
            })
            await message.reply({
              content: "Sorry, I couldn't reach the assistant right now. Please try again in a moment.",
              allowedMentions: { users: [message.author.id] },
            })
            return
          }
        }

        this.logger.info("Message logged from verified user", {
          displayName,
          discordUserTag: message.author.tag,
          userId: verification.user?.id,
          channelId: message.channelId,
          messagePreview: message.content?.substring(0, 100) || "",
        })
      } catch (error) {
        this.logger.error("Error verifying user", error, {
          discordUserId: message.author.id,
          discordUserTag: message.author.tag,
          channelId: message.channelId,
          channelType,
        })
        await message.reply("Sorry, I couldn't verify your access right now. Please try again in a moment.")
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


  private buildChatInput({ content, attachments, botId }: { content: string; attachments: any[]; botId: string | null }) {
    const strippedMention = this.stripBotMention(content, botId)
    const strippedCommand = this.stripCommandPrefix(strippedMention)
    const attachmentSummary = this.describeAttachments(attachments)

    return [strippedCommand, attachmentSummary].filter(Boolean).join("\n\n").trim()
  }

  private stripBotMention(content: string, botId: string | null) {
    if (!botId) {
      return content?.trim() || ""
    }

    const mentionPattern = new RegExp(`<@!?${botId}>`, "gi")
    return (content || "").replace(mentionPattern, " ").replace(/\s+/g, " ").trim()
  }

  private stripCommandPrefix(content: string) {
    const trimmed = content?.trim() || ""
    if (!trimmed) {
      return ""
    }

    const lower = trimmed.toLowerCase()
    for (const prefix of CHAT_TRIGGER_PREFIXES) {
      if (lower.startsWith(prefix)) {
        return trimmed.slice(prefix.length).trim()
      }
    }

    return trimmed
  }

  private describeAttachments(attachments: any[]) {
    if (!attachments || attachments.length === 0) {
      return ""
    }

    const lines = attachments.map((attachment, index) => {
      const label = attachment.name || `Attachment ${index + 1}`
      return `${index + 1}. ${label} - ${attachment.url}`
    })

    return `Attachments:\n${lines.join("\n")}`
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

// Singleton instance
let botInstance: DiscordBot | null = null

export function getDiscordBot(): DiscordBot {
  if (!botInstance) {
    botInstance = new DiscordBot()
  }
  return botInstance
}

