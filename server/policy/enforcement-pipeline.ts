/**
 * Enforcement Pipeline - System Prompt Composer & Output Moderator
 * Handles policy configuration and system prompt composition
 */
import { storage } from "../storage";
import { llmClient } from "../model/llm-client";
import crypto from "crypto";
import type { Policy } from "@shared/schema";

export class EnforcementPipeline {
  /**
   * Get policy or return default policy
   */
  async getOrCreateDefaultPolicy(): Promise<Policy> {
    const policy = await storage.getActivePolicy();
    
    if (policy) {
      return policy;
    }
    
    // Return default policy
    return {
      id: 0, // Virtual policy, not stored
      policyName: "Default Policy",
      rules: {
        hate_speech: false,
        explicit_sexual: false,
        self_harm: false,
        political_extremism: false,
        illicit_howto: false,
        mild_profanity: false,
        minor_violence: false,
      },
      onBlock: "refuse",
      humor: "neutral",
      tone: "professional",
      behavior: {
        verbosity: 0.7,
        formality: 0.5,
        creativity: 0.7,
        precision: 0.8,
      },
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      systemPrompt: `You are AION - an advanced AI assistant with access to comprehensive knowledge base, multimodal processing, and web search capabilities.

🛠️ AVAILABLE TOOLS & CAPABILITIES

You have access to the following tools to help users:

**WEB SEARCH & CONTENT DISCOVERY:**
• SearchWeb(query, maxResults) - General web search (DuckDuckGo)
• SearchVideos(query, maxResults) - Find videos on YouTube, Vimeo, etc.
• SearchImages(query, maxResults) - Find images on the web

**KNOWLEDGE BASE:**
• KBSearch(query, maxResults) - Search indexed knowledge base (RAG)

**EXECUTION:**
• Exec(code, language) - Execute code in sandbox

**CONTENT GENERATION:**
- Users can request images via DALL-E (handled automatically)
- Users can request videos via GPU workers (handled automatically)
- Users can request documents/code (handled automatically)

**WEB CONTENT DISPLAY:**
When users ask to "show me videos/images/documents about X", you should:
1. Use SearchVideos or SearchImages to find results
2. Return the results in a structured format
3. The frontend will display them in an interactive list
4. Users can click to view full content

Example interactions:
User: "me mostre vídeos sobre gatinhos"
Response: Use SearchVideos("gatinhos", 10) and return results

User: "show me images of mountains"
Response: Use SearchImages("mountains", 12) and return results

User: "find documents about AI"
Response: Use SearchWeb("AI documents filetype:pdf", 10)

Remember: You can SEARCH and DISPLAY web content, not just generate it!`,
      maxTokensPerDay: 100000,
      maxRequestsPerMinute: 60,
      maxCostPerDay: 10.0,
      enabledTools: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Detect language from user message
   * Improved to handle short messages correctly
   */
  private detectLanguage(userMessage: string): "pt-BR" | "en-US" | "es-ES" {
    const msg = userMessage.toLowerCase();
    
    // Portuguese strong indicators (including accents and common words)
    const ptStrongIndicators = /(olá|você|está|não|sim|obrigad|português|tchau|tudo bem|bom dia|boa tarde|boa noite)/i;
    const ptIndicators = /\b(é|muito|como|que|para|com|por|seu|sua|ele|ela|fazer|ter|ser|quando|onde|porque|qual|quem|algum|nenhum)\b/gi;
    
    // Spanish strong indicators
    const esStrongIndicators = /(hola|usted|está|sí|gracias|español|adiós|buenos días|buenas tardes|buenas noches)/i;
    const esIndicators = /\b(es|muy|cómo|qué|para|con|por|su|él|ella|hacer|tener|ser|cuando|donde|porque|cual|quien|algún|ningún)\b/gi;
    
    // English strong indicators
    const enStrongIndicators = /(hello|hi|hey|thanks|thank you|good morning|good afternoon|good evening)/i;
    
    // Check strong indicators first (for short messages)
    if (ptStrongIndicators.test(msg)) return "pt-BR";
    if (esStrongIndicators.test(msg)) return "es-ES";
    if (enStrongIndicators.test(msg)) return "en-US";
    
    // Count regular indicators for longer messages
    const ptMatches = (msg.match(ptIndicators) || []).length;
    const esMatches = (msg.match(esIndicators) || []).length;
    
    // If we have ANY Portuguese match and more than Spanish, it's Portuguese
    if (ptMatches > 0 && ptMatches > esMatches) return "pt-BR";
    if (esMatches > 0) return "es-ES";
    
    // Default to English
    return "en-US";
  }

  async composeSystemPrompt(policy: Policy, userMessage?: string): Promise<string> {
    let prompt = policy.systemPrompt || "You are AION, an advanced AI assistant.";
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🌍 UNIVERSAL MULTILINGUAL SUPPORT (Like ChatGPT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AION automatically detects and responds in ANY language the user writes in.
    // Supports 100+ languages: Portuguese, English, Spanish, Italian, French,
    // German, Chinese, Japanese, Korean, Arabic, Russian, Hindi, and many more.
    // No manual detection needed - the LLM handles this naturally.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 UNIVERSAL LANGUAGE INSTRUCTION 🌍
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ CRITICAL: ALWAYS RESPOND IN THE SAME LANGUAGE AS THE USER'S MESSAGE ⚠️

ABSOLUTE RULES:
✓ Automatically detect the user's language from their message
✓ Respond 100% in that SAME language (never switch languages)
✓ Support ALL languages: Portuguese, English, Spanish, Italian, French, German,
  Chinese, Japanese, Korean, Arabic, Russian, Hindi, and 100+ more
✓ If the user writes in Portuguese → respond in Portuguese
✓ If the user writes in English → respond in English  
✓ If the user writes in ANY other language → respond in THAT language
✓ Use natural, contextual, and varied responses in the detected language
✓ If you respond in a different language than the user, it's a CRITICAL FAILURE

This applies to ALL responses: normal answers, refusals, fallbacks, everything.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    // Add personality traits
    prompt += `\n\nPersonality:\n- Humor: ${policy.humor}\n- Tone: ${policy.tone}`;
    prompt += `\n- Verbosity: ${policy.behavior.verbosity}\n- Creativity: ${policy.behavior.creativity}`;
    
    // Add intelligence instructions
    prompt += `\n\n🧠 INTELLIGENCE & CONTEXT:
- NEVER respond with generic greetings like "Hello! How can I assist you today?" or "Olá! Como posso ajudar você hoje?"
- ALWAYS provide specific, contextual, and intelligent responses
- Remember conversation context and build upon it
- If asked a question, answer it directly and thoroughly
- If greeted, acknowledge warmly but also demonstrate understanding or ask a relevant follow-up
- Vary your responses - never be repetitive or robotic
- Be creative and contextual in EVERY response`;
    
    // Check if there are active rules
    const activeRules = Object.entries(policy.rules).filter(([_, active]) => active);
    
    if (activeRules.length > 0) {
      // When rules ARE active, add them
      prompt += `\n\nContent Guidelines:\n`;
      prompt += activeRules.map(([rule]) => `- Avoid: ${rule.replace(/_/g, " ")}`).join("\n");
    }
    
    return prompt;
  }

  async moderateOutput(content: string, policy: Policy): Promise<string> {
    const activeRules = Object.entries(policy.rules).filter(([_, active]) => active);
    
    // If no rules active, return content as-is (system born free)
    if (activeRules.length === 0) return content;
    
    // Check for violations
    const hasViolation = await this.checkViolations(content, activeRules);
    
    if (!hasViolation) return content;
    
    // Handle based on onBlock action
    if (policy.onBlock === "refuse") {
      return "[Content blocked by policy]";
    } else if (policy.onBlock === "redact") {
      return "[Content redacted]";
    } else if (policy.onBlock === "rewrite") {
      return await this.rewriteContent(content);
    }
    
    return content;
  }

  private async checkViolations(content: string, rules: [string, boolean][]): Promise<boolean> {
    const ruleNames = rules.map(([name]) => name).join(", ");
    const prompt = `Check if the following content violates any of these rules: ${ruleNames}\n\nContent: ${content}\n\nRespond with only YES or NO:`;
    
    const result = await llmClient.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-3.5-turbo",
      temperature: 0,
      maxTokens: 5,
    });
    
    return result.content.trim().toUpperCase() === "YES";
  }

  private async rewriteContent(content: string): Promise<string> {
    const prompt = `Rewrite the following content to be appropriate and policy-compliant:\n\n${content}`;
    const result = await llmClient.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-3.5-turbo",
      temperature: 0.7,
    });
    return result.content;
  }

  async createAuditLog(eventType: string, data: Record<string, any>, policy?: Policy): Promise<void> {
    const dataHash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
    
    await storage.createAuditLog({
      eventType,
      data,
      dataHash,
      policySnapshot: policy,
      actor: "system",
    });
  }
}

export const enforcementPipeline = new EnforcementPipeline();
