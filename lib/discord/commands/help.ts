import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
} from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import type { InteractionContext, SlashCommand } from "./registry"

/**
 * Command category for grouping related commands
 */
export type CommandCategory = "chat" | "media" | "context" | "utility"

/**
 * Command definition with metadata for help display
 */
export interface CommandDefinition {
  /** Primary command name (e.g., "!help") */
  name: string
  /** Alternative command names/aliases */
  aliases: string[]
  /** Short description of what the command does */
  description: string
  /** Syntax template (e.g., "!help [command]") */
  syntax: string
  /** Usage examples */
  examples: string[]
  /** Command category for grouping */
  category: CommandCategory
}

/**
 * Registry of all available Discord bot commands
 */
export const COMMAND_REGISTRY: CommandDefinition[] = [
  // Utility commands
  {
    name: "!help",
    aliases: ["!commands"],
    description: "Display available commands and usage information",
    syntax: "!help [command]",
    examples: ["!help", "!help finished"],
    category: "utility",
  },

  // Chat/assistant commands
  {
    name: "!assistant",
    aliases: ["!bot", "!support"],
    description: "Start a conversation with the AI assistant",
    syntax: "!assistant <message>",
    examples: ["!assistant How do I request a movie?", "!bot What shows are new this week?"],
    category: "chat",
  },

  // Context management
  {
    name: "!clear",
    aliases: ["!reset", "!clearcontext"],
    description: "Clear your conversation context and start fresh",
    syntax: "!clear",
    examples: ["!clear"],
    category: "context",
  },

  // Media marking commands - Finished Watching
  {
    name: "!finished",
    aliases: ["!done", "!watched"],
    description: "Mark media as finished watching (also marks as watched in Plex)",
    syntax: "!finished <title>",
    examples: ["!finished The Office", "!done Breaking Bad", "!watched Inception"],
    category: "media",
  },

  // Media marking commands - Not Interested
  {
    name: "!notinterested",
    aliases: ["!skip", "!pass"],
    description: "Mark media as not interested (won't be recommended)",
    syntax: "!notinterested <title>",
    examples: ["!notinterested Reality Show", "!skip Documentary", "!pass Horror Movie"],
    category: "media",
  },

  // Media marking commands - Keep Forever
  {
    name: "!keep",
    aliases: ["!favorite", "!fav"],
    description: "Mark media as keep forever (protected from auto-deletion)",
    syntax: "!keep <title>",
    examples: ["!keep The Godfather", "!favorite Seinfeld", "!fav Lord of the Rings"],
    category: "media",
  },

  // Media marking commands - Rewatch Candidate
  {
    name: "!rewatch",
    aliases: [],
    description: "Mark media as a rewatch candidate",
    syntax: "!rewatch <title>",
    examples: ["!rewatch Friends"],
    category: "media",
  },

  // Media marking commands - Poor Quality
  {
    name: "!badquality",
    aliases: ["!lowquality"],
    description: "Report media as poor quality (may be re-downloaded)",
    syntax: "!badquality <title>",
    examples: ["!badquality Blurry Movie", "!lowquality Bad Audio Film"],
    category: "media",
  },
]

/**
 * Get human-readable category label
 */
function getCategoryLabel(category: CommandCategory): string {
  switch (category) {
    case "chat":
      return "Chat & Assistant"
    case "media":
      return "Media Marking"
    case "context":
      return "Context Management"
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
    case "context":
      return "🔄"
    case "utility":
      return "🛠️"
    default:
      return "•"
  }
}

/**
 * Find a command by name or alias
 */
export function findCommand(searchTerm: string): CommandDefinition | undefined {
  const normalizedSearch = searchTerm.toLowerCase().replace(/^!/, "")

  return COMMAND_REGISTRY.find((cmd) => {
    const cmdName = cmd.name.toLowerCase().replace(/^!/, "")
    const cmdAliases = cmd.aliases.map((a) => a.toLowerCase().replace(/^!/, ""))
    return cmdName === normalizedSearch || cmdAliases.includes(normalizedSearch)
  })
}

/**
 * Build the full help message showing all commands grouped by category
 */
export function buildFullHelpMessage(): string {
  const lines: string[] = [
    "**Available Commands**",
    "",
  ]

  // Group commands by category
  const categories: CommandCategory[] = ["utility", "chat", "context", "media"]

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
  lines.push("• Use `!help <command>` for detailed info on a specific command")
  lines.push("• You can also DM me directly or @mention me to chat")
  lines.push("• Media commands search your Plex library by title")

  return lines.join("\n")
}

/**
 * Build detailed help message for a specific command
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
 * registry has four categories and a handful of commands each.
 *
 * @internal
 */
function buildFullHelpEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Available Commands")
    .setDescription(
      "Use `/help command:<name>` for details on a specific command."
    )

  const categories: CommandCategory[] = ["utility", "chat", "context", "media"]

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
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show available commands and how to use them")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Get detailed help for a specific command")
        .setAutocomplete(true)
    ) as SlashCommandBuilder,
  commandType: "HELP" as DiscordCommandType,
  async handle(ctx: InteractionContext): Promise<void> {
    const search = ctx.interaction.options.getString("command")

    if (search) {
      const command = findCommand(search)
      if (!command) {
        await ctx.interaction.reply({
          content: `Command not found: \`${search}\`. Use \`/help\` to see all available commands.`,
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
      embeds: [buildFullHelpEmbed()],
      flags: MessageFlags.Ephemeral,
    })
  },
  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase().replace(/^!/, "")

    const choices = COMMAND_REGISTRY.filter((cmd) =>
      cmd.name.toLowerCase().replace(/^!/, "").startsWith(focused)
    )
      .slice(0, AUTOCOMPLETE_CHOICE_LIMIT)
      .map((cmd) => {
        const name = cmd.name.replace(/^!/, "")
        return { name, value: name }
      })

    await interaction.respond(choices)
  },
}
