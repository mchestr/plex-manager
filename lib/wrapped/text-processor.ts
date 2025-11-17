/**
 * Post-processing utilities for LLM-generated wrapped content
 * Converts styling placeholders into React-compatible structures
 */

export interface TextPart {
  type: "text" | "highlight"
  content: string
}

/**
 * Parse text with styling tags and convert to structured parts
 * Supports: <highlight>text</highlight> and **text** (for backward compatibility)
 */
export function parseStyledText(text: string): TextPart[] {
  const parts: TextPart[] = []
  let currentIndex = 0

  // First, convert old **double asterisks** format to <highlight> tags for consistency
  let processedText = text.replace(/\*\*([^*]+)\*\*/g, "<highlight>$1</highlight>")

  // Regex to match <highlight>...</highlight> tags
  const highlightRegex = /<highlight>([^<]*)<\/highlight>/gi
  let match

  while ((match = highlightRegex.exec(processedText)) !== null) {
    // Add text before the match
    if (match.index > currentIndex) {
      const beforeText = processedText.substring(currentIndex, match.index)
      if (beforeText.trim()) {
        parts.push({ type: "text", content: beforeText })
      }
    }

    // Add the highlighted text
    parts.push({ type: "highlight", content: match[1] })

    currentIndex = match.index + match[0].length
  }

  // Add remaining text
  if (currentIndex < processedText.length) {
    const remainingText = processedText.substring(currentIndex)
    if (remainingText.trim()) {
      parts.push({ type: "text", content: remainingText })
    }
  }

  // If no matches found, return the text as-is
  if (parts.length === 0) {
    return [{ type: "text", content: text }]
  }

  return parts
}

/**
 * Process wrapped content sections and convert styling tags
 * This is called after LLM generation to prepare content for rendering
 */
export function processWrappedContent(content: string): TextPart[] {
  return parseStyledText(content)
}

/**
 * Strip highlight tags from text for plain text output (e.g., social media sharing)
 * Removes <highlight> and </highlight> tags while preserving the content
 */
export function stripHighlightTags(text: string): string {
  if (!text) return text

  // First, convert old **double asterisks** format to <highlight> tags for consistency
  let processedText = text.replace(/\*\*([^*]+)\*\*/g, "<highlight>$1</highlight>")

  // Remove <highlight> and </highlight> tags, keeping the content
  return processedText.replace(/<highlight>([^<]*)<\/highlight>/gi, "$1")
}

