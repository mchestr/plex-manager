import { KnowledgeSourcesBlock } from "@/components/admin/settings/assistant/knowledge-sources-block"
import { McpServersBlock } from "@/components/admin/settings/assistant/mcp-servers-block"
import { SkillSourcesBlock } from "@/components/admin/settings/assistant/skill-sources-block"
import { SettingsSection } from "@/components/ui/settings-section"
import type { AssistantSources } from "@/lib/data/assistant-sources"

/**
 * Assistant sources: MCP servers whose tools the admin assistant may call,
 * GitHub knowledge bases it searches and cites, and GitHub repositories of
 * skills it lists and follows. Each starts empty and adds nothing until the
 * admin sets one up. The lists are the view, with no section Edit; each row's
 * Edit, and each list's Add, opens its form in a Sheet, its edit mode. Each
 * list is its own block.
 */
export function AssistantSection({ sources }: { sources: AssistantSources }) {
  return (
    <SettingsSection
      id="assistant"
      title="Assistant sources"
      description="Only the admin assistant uses these, not the Discord assistant."
    >
      <div className="flex flex-col gap-6">
        <McpServersBlock servers={sources.mcpServers} />
        <KnowledgeSourcesBlock sources={sources.knowledgeSources} />
        <SkillSourcesBlock sources={sources.skillSources} />
      </div>
    </SettingsSection>
  )
}
