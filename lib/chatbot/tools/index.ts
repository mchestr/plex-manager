import "server-only"

export { generateSystemPrompt } from "@/lib/chatbot/prompts/default-system-prompt"
export { generateDiscordSystemPrompt } from "@/lib/chatbot/prompts/discord-system-prompt"
export {
  ALL_TOOLS,
  DISCORD_SAFE_TOOLS,
  getRegisteredTool,
  toolsForPermissions,
} from "./registry"
