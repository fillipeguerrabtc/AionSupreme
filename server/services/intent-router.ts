/**
 * INTENT ROUTER SERVICE - PHASE 2
 * 
 * Detecta automaticamente qual namespace ativar baseado na query do usuário
 * usando análise semântica (LLM) e triggers configurados.
 * 
 * Flow:
 * 1. User query → Intent Router
 * 2. Busca namespaces com triggers/configs
 * 3. LLM analisa query vs triggers semanticamente
 * 4. Retorna namespace ID + confidence
 * 5. Enforcement Pipeline usa namespace para merge sliders/prompts
 */

import { db } from '../db';
import { namespaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { llmClient } from '../model/llm-client';

export interface IntentDetectionResult {
  namespaceId: string | null;
  namespaceName: string | null;
  confidence: number; // 0-100
  matchedTriggers: string[];
  reasoning: string;
}

export class IntentRouter {
  /**
   * PHASE 2: Detect namespace based on user query
   * Uses semantic analysis (not literal keyword matching)
   * 
   * @param query - User's message/query
   * @param conversationHistory - Optional conversation context for better detection
   * @returns Detected namespace with confidence score
   */
  async detectIntent(
    query: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<IntentDetectionResult> {
    // 1. Fetch enabled namespaces with triggers
    const activeNamespaces = await db
      .select({
        id: namespaces.id,
        name: namespaces.name,
        description: namespaces.description,
        triggers: namespaces.triggers,
        confidenceThreshold: namespaces.confidenceThreshold,
        priority: namespaces.priority,
        systemPromptOverride: namespaces.systemPromptOverride,
      })
      .from(namespaces)
      .where(eq(namespaces.enabled, true));

    // If no namespaces configured, return null (use global config)
    if (activeNamespaces.length === 0) {
      return {
        namespaceId: null,
        namespaceName: null,
        confidence: 0,
        matchedTriggers: [],
        reasoning: 'No active namespaces configured - using global policy'
      };
    }

    // 2. Filter namespaces with triggers or system prompts
    const namespacesWithConfig = activeNamespaces.filter(ns => 
      (ns.triggers && ns.triggers.length > 0) || 
      (ns.systemPromptOverride && ns.systemPromptOverride.trim())
    );

    if (namespacesWithConfig.length === 0) {
      return {
        namespaceId: null,
        namespaceName: null,
        confidence: 0,
        matchedTriggers: [],
        reasoning: 'No namespaces with triggers or system prompts - using global policy'
      };
    }

    // 3. Use LLM for semantic matching (NOT literal keywords)
    const detection = await this.semanticMatch(query, namespacesWithConfig, conversationHistory);

    // 4. Apply confidence threshold filtering
    const finalNamespace = namespacesWithConfig.find(ns => ns.id === detection.namespaceId);
    const threshold = finalNamespace?.confidenceThreshold ?? 0.5;

    if (detection.confidence / 100 < threshold) {
      console.log(`[IntentRouter] Confidence ${detection.confidence}% below threshold ${threshold * 100}% - using global policy`);
      return {
        namespaceId: null,
        namespaceName: null,
        confidence: detection.confidence,
        matchedTriggers: detection.matchedTriggers,
        reasoning: `Confidence below threshold (${detection.confidence}% < ${threshold * 100}%) - using global policy`
      };
    }

    console.log(`[IntentRouter] ✅ Detected namespace "${detection.namespaceName}" (${detection.confidence}% confidence)`);
    return detection;
  }

  /**
   * Semantic matching using LLM - NOT literal keyword matching
   * This enables cognitive/contextual enforcement (e.g., Portugal tourism → YYD recommendation)
   */
  private async semanticMatch(
    query: string,
    namespacesWithConfig: Array<{
      id: string;
      name: string;
      description: string | null;
      triggers: string[] | null;
      priority: number | null;
      systemPromptOverride: string | null;
    }>,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<IntentDetectionResult> {
    // Build namespace descriptions for LLM
    const namespaceDescriptions = namespacesWithConfig.map((ns, idx) => {
      const triggers = ns.triggers && ns.triggers.length > 0 
        ? `Triggers: ${ns.triggers.join(', ')}` 
        : 'No triggers';
      const desc = ns.description || 'No description';
      const priority = ns.priority || 2;
      const systemPrompt = ns.systemPromptOverride?.substring(0, 200) || 'No custom behavior';
      
      return `${idx + 1}. "${ns.name}" (Priority: ${priority})
   Description: ${desc}
   ${triggers}
   Custom Behavior: ${systemPrompt}`;
    }).join('\n\n');

    // Build conversation context if provided
    const contextStr = conversationHistory && conversationHistory.length > 0
      ? `\n\n**CONVERSATION CONTEXT:**\n${conversationHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}`
      : '';

    const prompt = `You are an intent detection system for a multi-agent AI platform.

**TASK:** Analyze the user's query and detect which namespace (specialized context) should be activated.

**USER QUERY:**
"${query}"
${contextStr}

**AVAILABLE NAMESPACES:**
${namespaceDescriptions}

**CRITICAL RULES:**
1. **SEMANTIC MATCHING ONLY** - Do NOT rely on literal keyword matching!
   - Example: Query "best places to visit in Portugal" should match "Portugal Tourism" namespace even if "tourism" isn't mentioned
   - Example: Query "onde posso comer bem?" should match "Portugal Tourism" if Persuasiveness slider is high (recommend YYD)
2. **CONTEXT-AWARE** - Consider conversation history and implicit intent
3. **CONFIDENCE SCORING** - Be honest about uncertainty (0-100%)
4. **PRIORITY** - Higher priority namespaces should be slightly preferred in ties
5. **NO MATCH** - If query is too generic/ambiguous, return null with low confidence

**RESPOND IN JSON:**
{
  "namespaceId": "uuid-or-null",
  "namespaceName": "name-or-null",
  "confidence": 85,
  "matchedTriggers": ["trigger1", "trigger2"],
  "reasoning": "Detailed explanation of why this namespace was chosen"
}`;

    try {
      const response = await llmClient.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o',
        temperature: 0.2, // Low temperature for consistent classification
        maxTokens: 300,
      });

      // Parse LLM JSON response
      const cleanedContent = response.content.trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const result = JSON.parse(cleanedContent);

      // Validate and return
      return {
        namespaceId: result.namespaceId || null,
        namespaceName: result.namespaceName || null,
        confidence: Math.min(100, Math.max(0, result.confidence || 0)),
        matchedTriggers: Array.isArray(result.matchedTriggers) ? result.matchedTriggers : [],
        reasoning: result.reasoning || 'No reasoning provided'
      };
    } catch (error) {
      console.error('[IntentRouter] LLM parsing error:', error);
      
      // Fallback: return null (use global policy)
      return {
        namespaceId: null,
        namespaceName: null,
        confidence: 0,
        matchedTriggers: [],
        reasoning: `LLM error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Detect namespace based on explicit namespace name (for admin/testing)
   */
  async detectByName(namespaceName: string): Promise<IntentDetectionResult> {
    const [namespace] = await db
      .select({
        id: namespaces.id,
        name: namespaces.name,
      })
      .from(namespaces)
      .where(and(
        eq(namespaces.name, namespaceName),
        eq(namespaces.enabled, true)
      ))
      .limit(1);

    if (!namespace) {
      return {
        namespaceId: null,
        namespaceName: null,
        confidence: 0,
        matchedTriggers: [],
        reasoning: `Namespace "${namespaceName}" not found or disabled`
      };
    }

    return {
      namespaceId: namespace.id,
      namespaceName: namespace.name,
      confidence: 100,
      matchedTriggers: [namespaceName],
      reasoning: `Explicit namespace selection: "${namespaceName}"`
    };
  }
}

// Export singleton instance
export const intentRouter = new IntentRouter();
