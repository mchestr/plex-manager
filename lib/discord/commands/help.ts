import {
  EmbedBuilder,
  MessageFlags,
  type AutocompleteInteraction,
} from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { getAssistantDisclosure } from "@/lib/llm/assistant-disclosure"
import { COMMAND_DEFINITIONS } from "./definitions"
import type { InteractionContext, SlashCommand } from "./registry"
import { requireLinkedUser } from "./require-linked-user"

/**
 * Command category for grouping related commands
 */
type CommandCategory = "chat" | "media" | "utility"

/**
 * Command definition with metadata for help display.
 *
 * These describe the bot's slash-command surface. Slash commands have no
 * aliases, so `aliases` is retained (for the embed/help renderers) but is
 * always empty.
 *
 * @internal
 */
export interface CommandDefinition {
  /** Primary command name (e.g., "/help", "/mark finished") */
  name: string
  /** Alternative command names/aliases (always empty for slash commands) */
  aliases: string[]
  /** Short description of what the command does */
  description: string
  /** Syntax template (e.g., "/help [command]") */
  syntax: string
  /** Usage examples */
  examples: string[]
  /** Command category for grouping */
  category: CommandCategory
}

/**
 * Registry of all available Discord bot slash commands, used to render `/help`.
 *
 * @internal
 */
export const COMMAND_REGISTRY: CommandDefinition[] = [
  // Utility commands
  {
    name: "/help",
    aliases: [],
    description: "Show the commands and how to use them",
    syntax: "/help [command]",
    examples: ["/help", "/help mark finished"],
    category: "utility",
  },

  // Chat/assistant commands
  {
    name: "/assistant",
    aliases: [],
    description:
      "Ask the AI assistant a question with `ask prompt:<text>`. Use `reset` to start a new conversation. Server admins can review assistant conversations",
    syntax: "/assistant ask prompt:<text> | /assistant reset",
    examples: [
      "/assistant ask prompt:How do I request a movie?",
      "/assistant reset",
    ],
    category: "chat",
  },
  {
    name: "/mystats",
    aliases: [],
    description: "Show your Plex watch stats for this year. Only you see them",
    syntax: "/mystats",
    examples: ["/mystats"],
    category: "chat",
  },
  {
    name: "/watching",
    aliases: [],
    description: "Show your current Plex streams",
    syntax: "/watching",
    examples: ["/watching"],
    category: "chat",
  },

  // Media commands - viewing your marks
  {
    name: "/mymarks",
    aliases: [],
    description: "Show the titles you marked. Add `type` to show one type only",
    syntax: "/mymarks [type]",
    examples: ["/mymarks", "/mymarks type:keep"],
    category: "media",
  },

  // Media marking commands - Finished Watching
  {
    name: "/mark finished",
    aliases: [],
    description: "Mark a title as finished. Plex also marks it as watched on your account",
    syntax: "/mark finished title:<name>",
    examples: ["/mark finished title:The Office"],
    category: "media",
  },

  // Media marking commands - Keep Forever
  {
    name: "/mark keep",
    aliases: [],
    description: "Mark a title to keep forever. Automatic deletion does not remove it",
    syntax: "/mark keep title:<name>",
    examples: ["/mark keep title:The Godfather"],
    category: "media",
  },

  // Media marking commands - Not Interested
  {
    name: "/mark notinterested",
    aliases: [],
    description: "Mark a title as not interesting to you. It is not recommended to you",
    syntax: "/mark notinterested title:<name>",
    examples: ["/mark notinterested title:Reality Show"],
    category: "media",
  },

  // Media marking commands - Rewatch Candidate
  {
    name: "/mark rewatch",
    aliases: [],
    description: "Mark a title to watch again",
    syntax: "/mark rewatch title:<name>",
    examples: ["/mark rewatch title:Friends"],
    category: "media",
  },

  // Media marking commands - Poor Quality
  {
    name: "/mark badquality",
    aliases: [],
    description: "Report poor quality. The server may download it again",
    syntax: "/mark badquality title:<name>",
    examples: ["/mark badquality title:Blurry Movie"],
    category: "media",
  },
]

/**
 * Get human-readable category label
 */
function getCategoryLabel(category: CommandCategory): string {
  switch (category) {
    case "chat":
      return "Chat and assistant"
    case "media":
      return "Media"
    case "utility":
      return "Utility"
    default:
      return category
  }
}

/**
 * Get category emoji for visual distinction
 */
function getCategoryEmoji(category: CommandCategory): string {
  switch (category) {
    case "chat":
      return "💬"
    case "media":
      return "🎬"
    case "utility":
      return "🛠️"
    default:
      return "•"
  }
}

/**
 * Find a command by name (or, if present, alias).
 *
 * The leading `/` is optional and case is ignored, so `mark finished`,
 * `/mark finished`, and `/MARK FINISHED` all resolve the same entry.
 *
 * @internal
 */
export function findCommand(searchTerm: string): CommandDefinition | undefined {
  const normalizedSearch = searchTerm.toLowerCase().replace(/^\//, "")

  return COMMAND_REGISTRY.find((cmd) => {
    const cmdName = cmd.name.toLowerCase().replace(/^\//, "")
    const cmdAliases = cmd.aliases.map((a) => a.toLowerCase().replace(/^\//, ""))
    return cmdName === normalizedSearch || cmdAliases.includes(normalizedSearch)
  })
}

/**
 * Build the full help message showing all commands grouped by category
 *
 * @internal
 */
export function buildFullHelpMessage(): string {
  const lines: string[] = [
    "**Commands**",
    "",
  ]

  // Group commands by category
  const categories: CommandCategory[] = ["utility", "chat", "media"]

  for (const category of categories) {
    const commands = COMMAND_REGISTRY.filter((cmd) => cmd.category === category)
    if (commands.length === 0) continue

    lines.push(`${getCategoryEmoji(category)} **${getCategoryLabel(category)}**`)

    for (const cmd of commands) {
      const aliasText = cmd.aliases.length > 0 ? ` (or ${cmd.aliases.join(", ")})` : ""
      lines.push(`  \`${cmd.syntax}\`${aliasText}`)
      lines.push(`    ${cmd.description}`)
    }
    lines.push("")
  }

  lines.push("**Tips:**")
  lines.push("• Use `/help command:<name>` to see help for one command")
  lines.push("• Send me a direct message to talk to the assistant")
  lines.push("• Media commands find titles in the Plex library")

  return lines.join("\n")
}

/**
 * Build detailed help message for a specific command
 *
 * @internal
 */
export function buildCommandHelpMessage(command: CommandDefinition): string {
  const lines: string[] = [
    `**Command: ${command.name}**`,
    "",
    `📝 **Description:** ${command.description}`,
    "",
    `📋 **Syntax:** \`${command.syntax}\``,
  ]

  if (command.aliases.length > 0) {
    lines.push(`🔗 **Aliases:** ${command.aliases.map((a) => `\`${a}\``).join(", ")}`)
  }

  lines.push("")
  lines.push("**Examples:**")
  for (const example of command.examples) {
    lines.push(`  \`${example}\``)
  }

  lines.push("")
  lines.push(`📁 **Category:** ${getCategoryEmoji(command.category)} ${getCategoryLabel(command.category)}`)

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Slash-command surface (`/help`)
// ---------------------------------------------------------------------------

/** Discord embed field-value limit. */
const EMBED_FIELD_VALUE_LIMIT = 1024
/** Discord per-message autocomplete choice limit. */
const AUTOCOMPLETE_CHOICE_LIMIT = 25

/**
 * Build the full-help embed grouping every registered command by category.
 *
 * One embed field per non-empty category, so the layout stays well under
 * Discord's structural limits (≤25 fields, ≤1024 chars/field, ≤6000 total): the
 * registry has three categories and a handful of commands each.
 *
 * @internal
 */
function buildFullHelpEmbed(disclosure: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Commands")
    .setDescription(
      "Use `/help command:<name>` to see help for one command."
    )

  const categories: CommandCategory[] = ["utility", "chat", "media"]

  for (const category of categories) {
    const commands = COMMAND_REGISTRY.filter((cmd) => cmd.category === category)
    if (commands.length === 0) continue

    const value = commands
      .map((cmd) => {
        const aliasText =
          cmd.aliases.length > 0 ? ` (or ${cmd.aliases.join(", ")})` : ""
        return `\`${cmd.syntax}\`${aliasText}\n${cmd.description}`
      })
      .join("\n\n")
      .slice(0, EMBED_FIELD_VALUE_LIMIT)

    embed.addFields({
      name: `${getCategoryEmoji(category)} ${getCategoryLabel(category)}`,
      value,
    })
  }

  // The assistant disclosure (P11.16, GAP-32)
  embed.addFields({ name: "Privacy", value: disclosure })

  return embed
}

/**
 * Build a detailed embed for a single command.
 *
 * @internal
 */
function buildCommandHelpEmbed(command: CommandDefinition): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Command: ${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: "Syntax", value: `\`${command.syntax}\`` },
      {
        name: "Examples",
        value: command.examples.map((e) => `\`${e}\``).join("\n"),
      },
      {
        name: "Category",
        value: `${getCategoryEmoji(command.category)} ${getCategoryLabel(command.category)}`,
      }
    )

  if (command.aliases.length > 0) {
    embed.addFields({
      name: "Aliases",
      value: command.aliases.map((a) => `\`${a}\``).join(", "),
    })
  }

  return embed
}

/**
 * The `/help [command]` slash command.
 *
 * With no `command` option it renders the full catalogue grouped by category;
 * with one it renders a detailed embed for the matching command (or an
 * ephemeral "not found" message). Replies are always ephemeral. The `command`
 * option autocompletes against registered command names.
 */
export const helpCommand: SlashCommand = {
  data: COMMAND_DEFINITIONS.help,
  commandType: "HELP" as DiscordCommandType,
  async handle(ctx: InteractionContext): Promise<void> {
    // Gate on entitlement like every other command (data-disclosure policy: no
    // command is usable by a non-entitled user). `/help` exposes no per-user data,
    // but gating keeps the surface uniform and the nudge points unlinked users at
    // the portal so they still learn how to link. (Autocomplete stays ungated — it
    // is a typeahead callback, not an invocation, and surfaces only command names.)
    const user = await requireLinkedUser(ctx, { action: "use the bot" })
    if (!user) return

    const search = ctx.interaction.options.getString("command")

    if (search) {
      const command = findCommand(search)
      if (!command) {
        await ctx.interaction.reply({
          content: `There is no command \`${search}\`. Use \`/help\` to see all commands.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      await ctx.interaction.reply({
        embeds: [buildCommandHelpEmbed(command)],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await ctx.interaction.reply({
      embeds: [buildFullHelpEmbed(await getAssistantDisclosure())],
      flags: MessageFlags.Ephemeral,
    })
  },
  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase().replace(/^\//, "")

    const choices = COMMAND_REGISTRY.filter((cmd) =>
      cmd.name.toLowerCase().replace(/^\//, "").startsWith(focused)
    )
      .slice(0, AUTOCOMPLETE_CHOICE_LIMIT)
      .map((cmd) => {
        const name = cmd.name.replace(/^\//, "")
        return { name, value: name }
      })

    await interaction.respond(choices)
  },
}
