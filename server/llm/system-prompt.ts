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
 * - Intercepts trivial greetings with conversational short-circuit (bypasses Free LLMs)
 */

import { EnforcementPipeline } from '../policy/enforcement-pipeline';
import { intentRouter } from '../services/intent-router'; // PHASE 2: Intent detection
import type { LLMRequest } from './free-apis';

/**
 * CONVERSATIONAL SHORT-CIRCUIT for greetings
 * 
 * Free LLMs (Groq, Gemini, HF) ignore system prompts on short queries (<10 tokens)
 * and return dictionary-style definitions. This function intercepts trivial greetings
 * and returns natural, friendly responses WITHOUT hitting any LLM.
 * 
 * @param query - User message (trimmed lowercase for matching)
 * @returns Friendly canned response or null if not a greeting
 */
export function answerGreeting(query: string): string | null {
  const normalized = query.trim().toLowerCase();
  
  // Detect language from greeting
  const isPortuguese = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eai|salve|beleza|tudo bem|coé)/.test(normalized);
  const isEnglish = /^(hi|hello|hey|good morning|good afternoon|good evening|sup|what's up)/.test(normalized);
  const isSpanish = /^(hola|buenos días|buenas tardes|buenas noches|qué tal)/.test(normalized);
  
  // Portuguese greetings (most common for AION)
  if (isPortuguese) {
    const responses = [
      "Oi! Tudo bem? Como posso te ajudar hoje?",
      "Olá! Pronto para conversar. O que precisa?",
      "Opa! E aí, qual é a boa?",
      "Oi! Pode falar, estou aqui!",
      "Olá! Bora lá, no que posso ajudar?"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // English greetings
  if (isEnglish) {
    const responses = [
      "Hey! What can I help you with?",
      "Hi there! Ready to chat. What's up?",
      "Hello! How can I assist you today?",
      "Hey! What do you need?",
      "Hi! I'm here, shoot!"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Spanish greetings
  if (isSpanish) {
    const responses = [
      "¡Hola! ¿En qué puedo ayudarte?",
      "¡Qué tal! ¿Qué necesitas?",
      "¡Hola! Listo para charlar. ¿Qué pasa?",
      "¡Hey! ¿Cómo te puedo ayudar hoy?",
      "¡Hola! Dime, ¿qué necesitas?"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Not a simple greeting - let LLM handle it
  return null;
}

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

  /**
   * Detected language from user message (pt-BR, en-US, es-ES)
   * If provided, bypasses auto-detection and enforces language directive
   */
  detectedLanguage?: string;
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
    additionalToneInstructions = '',
    detectedLanguage
  } = options;

  // Step 1: Get unified conversational system prompt from Enforcement Pipeline
  const pipeline = new EnforcementPipeline();
  const policy = await pipeline.getOrCreateDefaultPolicy();
  
  // Extract LAST user message for language detection (not first!)
  // This ensures language switching works: PT→EN, EN→PT, etc.
  const userMessages = baseMessages.filter(m => m.role === 'user');
  const userMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : undefined;
  
  // PHASE 2: Detect namespace for semantic enforcement
  const intentDetection = userMessage ? await intentRouter.detectIntent(userMessage) : { namespaceId: null };
  
  // ✅ FIX: Pass detectedLanguage to prevent re-detection with limited regex
  // PHASE 2: Pass namespaceId for namespace-aware enforcement
  const baseSystemPrompt = await pipeline.composeSystemPrompt(
    policy, 
    userMessage, 
    detectedLanguage,
    intentDetection.namespaceId || undefined
  );

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
 *   'Answer based ONLY on the provided context.',
 *   'en-US'
 * );
 */
export async function buildKBResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  kbContext: string,
  instruction?: string,
  detectedLanguage?: string
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
    },
    detectedLanguage
  });
}

/**
 * Helper for web-enhanced responses (with search results)
 * 
 * @example
 * const request = await buildWebResponse(
 *   [{ role: 'user', content: 'Latest news about AI?' }],
 *   'Top results:\n1. OpenAI releases...\n2. Google announces...',
 *   undefined,
 *   'en-US'
 * );
 */
export async function buildWebResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  webResults: string,
  instruction?: string,
  detectedLanguage?: string
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
    },
    detectedLanguage
  });
}
