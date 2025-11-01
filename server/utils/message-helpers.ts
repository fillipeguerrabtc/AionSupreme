/**
 * MESSAGE HELPERS
 * Utility functions for processing message content
 */

/**
 * Extract text content from message (handles string, array, object formats)
 * Used for normalizing multimodal message content to plain text
 */
export function extractTextContent(content: any): string {
  if (typeof content === "string") {
    return content;
  } else if (Array.isArray(content)) {
    // OpenAI multimodal format: [{type: "text", text: "..."}, ...]
    return content
      .filter((part: any) => part.type === "text" || typeof part === "string")
      .map((part: any) => typeof part === "string" ? part : part.text || "")
      .join(" ");
  } else if (content && typeof content === "object") {
    // Fallback for objects
    return JSON.stringify(content);
  }
  return String(content || '');
}
