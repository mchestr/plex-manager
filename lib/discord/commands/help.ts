import type { Message } from "discord.js"

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

/**
 * Handle the help command
 */
export async function handleHelpCommand(message: Message, args: string[]): Promise<void> {
  // Check if asking for help on a specific command
  if (args.length > 0) {
    const searchTerm = args[0]
    const command = findCommand(searchTerm)

    if (command) {
      await message.reply({
        content: buildCommandHelpMessage(command),
        allowedMentions: { users: [message.author.id] },
      })
    } else {
      await message.reply({
        content: `Command not found: \`${searchTerm}\`. Use \`!help\` to see all available commands.`,
        allowedMentions: { users: [message.author.id] },
      })
    }
    return
  }

  // Show full help message
  await message.reply({
    content: buildFullHelpMessage(),
    allowedMentions: { users: [message.author.id] },
  })
}

/**
 * Help command triggers
 */
export const HELP_COMMANDS = ["!help", "!commands"]
