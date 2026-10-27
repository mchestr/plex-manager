import "server-only"

import { type RegisteredTool } from "./types"

/** Admin-only tools over the GitHub knowledge base sources; never `discordSafe`. */
export const KNOWLEDGE_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:admin",
    function: {
      name: "search_knowledge_base",
      description:
        "Search the operator knowledge base (Markdown runbooks and fixes) for a problem or question. Returns matching documents with path, title, snippets and a url to cite. Use it before answering how-to or troubleshooting questions.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Keywords, e.g. 'rewind generation failed'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:admin",
    function: {
      name: "read_knowledge_doc",
      description: "Read one knowledge base document in full, by the path and source returned from search_knowledge_base.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", description: "The source name from the search result" },
          path: { type: "string", description: "The document path from the search result" },
        },
        required: ["source", "path"],
      },
    },
  },
]
