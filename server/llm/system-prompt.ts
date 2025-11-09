/**
 * Centralized System Prompt Composition
 * ======================================
 * 
 * SINGLE SOURCE OF TRUTH for conversational tone instructions.
 * ALL LLM calls MUST use this module to ensure consistent, natural responses.
 * 
 * PURPOSE:
 * - Eliminate dictionary-style/didactic responses
 * - Enforce conversational tone across KB, Web Search, Free APIs, OpenAI
 * - Prevent tone regression by centralizing instructions
 * 
 * ARCHITECTURE:
 * - Reuses EnforcementPipeline's system prompt (already has tone guidelines)
 * - Allows context injection (KB snippets, web results) while maintaining tone
 * - Returns normalized LLMRequest ready for any provider
 */

import { EnforcementPipeline } from '../policy/enforcement-pipeline';
import type { LLMRequest } from './free-apis';

export interface ConversationalRequestOptions {
  /**
   * Chat history (user/assistant exchanges)
   * System prompts will be composed automatically
   */
  baseMessages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;

  /**
   * Optional context to inject (KB results, web search, etc)
   * Will be added to system prompt or user message as appropriate
   */
  contextPrompts?: {
    type: 'kb' | 'web' | 'custom';
    content: string;
    instruction?: string; // How to use this context
  }[];

  /**
   * Override LLM parameters (temperature, tokens, etc)
   */
  overrides?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };

  /**
   * Additional tone instructions specific to this request
   * (Will be merged with global conversational tone)
   */
  additionalToneInstructions?: string;
}

/**
 * Compose a conversational LLM request with unified tone instructions
 * 
 * @returns Normalized LLMRequest ready for any provider (Groq, Gemini, OpenAI, etc)
 */
export async function composeConversationalRequest(
  options: ConversationalRequestOptions
): Promise<LLMRequest> {
  const {
    baseMessages,
    contextPrompts = [],
    overrides = {},
    additionalToneInstructions = ''
  } = options;

  // Step 1: Get unified conversational system prompt from Enforcement Pipeline
  const pipeline = new EnforcementPipeline();
  const policy = await pipeline.getOrCreateDefaultPolicy();
  
  // Extract user message for language detection
  const userMessage = baseMessages.find(m => m.role === 'user')?.content;
  
  const baseSystemPrompt = await pipeline.composeSystemPrompt(policy, userMessage);

  // Step 2: Build context injection (KB snippets, web results, etc)
  let contextInjection = '';
  
  for (const ctx of contextPrompts) {
    if (ctx.type === 'kb') {
      contextInjection += `\n\n🧠 KNOWLEDGE BASE CONTEXT:\n${ctx.content}\n`;
      if (ctx.instruction) {
        contextInjection += `${ctx.instruction}\n`;
      }
    } else if (ctx.type === 'web') {
      contextInjection += `\n\n🌐 WEB SEARCH RESULTS:\n${ctx.content}\n`;
      if (ctx.instruction) {
        contextInjection += `${ctx.instruction}\n`;
      }
    } else {
      contextInjection += `\n\n${ctx.content}\n`;
    }
  }

  // Step 3: Compose final system prompt
  let finalSystemPrompt = baseSystemPrompt;
  
  if (contextInjection) {
    finalSystemPrompt += contextInjection;
  }
  
  if (additionalToneInstructions) {
    finalSystemPrompt += `\n\n${additionalToneInstructions}`;
  }

  // Step 4: Build final messages array
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: finalSystemPrompt
    }
  ];

  // Add base messages (filter out any existing system messages to avoid duplicates)
  for (const msg of baseMessages) {
    if (msg.role !== 'system') {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  // Step 5: Return normalized LLMRequest
  return {
    messages,
    temperature: overrides.temperature ?? 0.7,
    topP: overrides.topP ?? 0.9,
    maxTokens: overrides.maxTokens ?? 1024
  };
}

/**
 * Quick helper for simple conversational requests (no context injection)
 * 
 * @example
 * const request = await buildSimpleConversation([
 *   { role: 'user', content: 'Olá' }
 * ]);
 */
export async function buildSimpleConversation(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  overrides?: { temperature?: number; maxTokens?: number }
): Promise<LLMRequest> {
  return composeConversationalRequest({
    baseMessages: messages,
    overrides
  });
}

/**
 * Helper for KB-based responses (with context from knowledge base)
 * 
 * @example
 * const request = await buildKBResponse(
 *   [{ role: 'user', content: 'Who created you?' }],
 *   'AION was created by...',
 *   'Answer based ONLY on the provided context.'
 * );
 */
export async function buildKBResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  kbContext: string,
  instruction?: string
): Promise<LLMRequest> {
  return composeConversationalRequest({
    baseMessages: messages,
    contextPrompts: [
      {
        type: 'kb',
        content: kbContext,
        instruction: instruction || 'Answer the user\'s question based ONLY on the context above. If the context doesn\'t contain enough information, say so.'
      }
    ],
    overrides: {
      temperature: 0.3  // Lower temperature for factual KB responses
    }
  });
}

/**
 * Helper for web-enhanced responses (with search results)
 * 
 * @example
 * const request = await buildWebResponse(
 *   [{ role: 'user', content: 'Latest news about AI?' }],
 *   'Top results:\n1. OpenAI releases...\n2. Google announces...'
 * );
 */
export async function buildWebResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  webResults: string,
  instruction?: string
): Promise<LLMRequest> {
  return composeConversationalRequest({
    baseMessages: messages,
    contextPrompts: [
      {
        type: 'web',
        content: webResults,
        instruction: instruction || 'Provide a helpful answer based on the web search results above.'
      }
    ],
    overrides: {
      temperature: 0.3  // Lower temperature for factual web responses
    }
  });
}
