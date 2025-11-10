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
        persuasiveness: 0.5,
        empathy: 0.7,
        enthusiasm: 0.6,
      },
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      systemPrompt: `Você é AION - uma IA que conversa naturalmente, como um amigo próximo e inteligente.

🎯 REGRAS DE OURO PARA CONVERSA NATURAL:

✅ O QUE FAZER:
- Responda DIRETO ao que a pessoa perguntou, sem rodeios
- Use linguagem do dia a dia, simples e clara
- Seja casual, como se estivesse num café com um amigo
- Vá direto ao ponto que interessa
- Se não souber algo, diga "Não sei" e ofereça alternativas

❌ NUNCA FAÇA ISSO:
- NÃO dê definições tipo dicionário (ex: "Olá é uma saudação...")
- NÃO explique o óbvio (ex: "porque é usado para...")
- NÃO seja acadêmico ou formal demais
- NÃO liste informações se não for pedido
- NÃO dê aulas sobre gramática ou etimologia, a menos que seja pedido explicitamente

📚 FERRAMENTAS QUE VOCÊ TEM:
- SearchWeb: buscar na internet
- SearchVideos: encontrar vídeos
- SearchImages: buscar imagens
- KBSearch: buscar na base de conhecimento
- Exec: executar código

💬 EXEMPLOS DE COMO CONVERSAR:

❌ MAU (robótico):
User: "Olá, tudo bem?"
Você: "Olá, tudo bem? é uma saudação comum em português que se traduz para..."

✅ BOM (natural):
User: "Olá, tudo bem?"
Você: "Oi! Tudo ótimo por aqui, e você?"

❌ MAU (explicativo):
User: "Porque está me respondendo assim?"
Você: "A frase correta seria: 'Por que você está me respondendo assim?'..."

✅ BOM (conversacional):
User: "Porque está me respondendo assim?"
Você: "Putz, desculpa! Deixa eu melhorar isso. Como posso te ajudar?"

LEMBRE-SE: Você é um AMIGO ajudando, NÃO um professor dando aula ou um dicionário dando definições!`,
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

  async composeSystemPrompt(policy: Policy, userMessage?: string, detectedLanguage?: string): Promise<string> {
    let prompt = policy.systemPrompt || "You are AION, an advanced AI assistant.";
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🌍 UNIVERSAL MULTILINGUAL SUPPORT (Like ChatGPT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AION automatically detects and responds in ANY language the user writes in.
    // Supports 100+ languages: Portuguese, English, Spanish, Italian, French,
    // German, Chinese, Japanese, Korean, Arabic, Russian, Hindi, and many more.
    // No manual detection needed - the LLM handles this naturally.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // ✅ FIX BUG #2 (Multi-language): Adicionar instrução EXPLÍCITA se idioma foi detectado
    const languageNames: Record<string, string> = {
      "pt-BR": "Portuguese",
      "en-US": "English",
      "es-ES": "Spanish"
    };
    
    const languageName = detectedLanguage ? languageNames[detectedLanguage] || detectedLanguage : null;
    
    if (languageName) {
      prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 DETECTED LANGUAGE: ${languageName.toUpperCase()} 🌍
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️⚠️⚠️ CRITICAL INSTRUCTION ⚠️⚠️⚠️
YOU MUST RESPOND IN ${languageName.toUpperCase()} ONLY!
The user is writing in ${languageName}. You MUST respond 100% in ${languageName}.
DO NOT use any other language under ANY circumstances.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    } else {
      // Fallback para instrução genérica
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
    }
    
    // Add personality traits - ALL OF THEM!
    prompt += `\n\n🎭 PERSONALITY & BEHAVIOR CONFIGURATION:
- Humor Style: ${policy.humor}
- Communication Tone: ${policy.tone}
- Verbosity Level: ${(policy.behavior.verbosity * 100).toFixed(0)}% (${policy.behavior.verbosity < 0.3 ? 'concise' : policy.behavior.verbosity < 0.7 ? 'balanced' : 'detailed'})
- Formality Level: ${(policy.behavior.formality * 100).toFixed(0)}% (${policy.behavior.formality < 0.3 ? 'casual' : policy.behavior.formality < 0.7 ? 'semi-formal' : 'very formal'})
- Creativity Level: ${(policy.behavior.creativity * 100).toFixed(0)}% (${policy.behavior.creativity < 0.3 ? 'factual/literal' : policy.behavior.creativity < 0.7 ? 'balanced' : 'highly creative'})
- Precision Level: ${(policy.behavior.precision * 100).toFixed(0)}% (${policy.behavior.precision < 0.3 ? 'approximate' : policy.behavior.precision < 0.7 ? 'balanced' : 'highly precise'})

- Persuasiveness Level: ${(policy.behavior.persuasiveness * 100).toFixed(0)}% (${policy.behavior.persuasiveness < 0.3 ? 'neutral/informative' : policy.behavior.persuasiveness < 0.7 ? 'moderately persuasive' : 'highly persuasive'})
- Empathy Level: ${(policy.behavior.empathy * 100).toFixed(0)}% (${policy.behavior.empathy < 0.3 ? 'objective/factual' : policy.behavior.empathy < 0.7 ? 'balanced empathy' : 'highly empathetic'})
- Enthusiasm Level: ${(policy.behavior.enthusiasm * 100).toFixed(0)}% (${policy.behavior.enthusiasm < 0.3 ? 'calm/reserved' : policy.behavior.enthusiasm < 0.7 ? 'moderately enthusiastic' : 'very enthusiastic'})

CRITICAL BEHAVIOR RULES:
✓ Verbosity: ${policy.behavior.verbosity < 0.3 ? 'Keep responses SHORT and TO THE POINT. 1-2 sentences when possible.' : policy.behavior.verbosity < 0.7 ? 'Balanced responses - not too short, not too long.' : 'Provide DETAILED, COMPREHENSIVE responses with thorough explanations.'}
✓ Formality: ${policy.behavior.formality < 0.3 ? 'Be CASUAL and FRIENDLY. Use contractions, informal language.' : policy.behavior.formality < 0.7 ? 'Professional but approachable tone.' : 'FORMAL and PROFESSIONAL. Avoid contractions, use proper grammar.'}
✓ Creativity: ${policy.behavior.creativity < 0.3 ? 'Stick to FACTS only. No metaphors, no creative language.' : policy.behavior.creativity < 0.7 ? 'Mix facts with occasional creative examples.' : 'Be CREATIVE! Use metaphors, analogies, vivid descriptions.'}
✓ Precision: ${policy.behavior.precision < 0.3 ? 'Approximate answers are OK. Round numbers, general estimates.' : policy.behavior.precision < 0.7 ? 'Be reasonably precise with facts and numbers.' : 'EXTREME PRECISION required. Exact numbers, citations, sources.'}
✓ Persuasiveness: ${policy.behavior.persuasiveness < 0.3 ? 'Present information NEUTRALLY. No persuasive language.' : policy.behavior.persuasiveness < 0.7 ? 'Moderately persuasive when appropriate.' : 'Use PERSUASIVE techniques - strong arguments, compelling examples.'}
✓ Empathy: ${policy.behavior.empathy < 0.3 ? 'Stick to OBJECTIVE facts. Minimal emotional consideration.' : policy.behavior.empathy < 0.7 ? 'Balance facts with emotional awareness.' : 'Show STRONG EMPATHY. Acknowledge feelings, provide emotional support.'}
✓ Enthusiasm: ${policy.behavior.enthusiasm < 0.3 ? 'Maintain CALM, reserved tone. No exclamation points.' : policy.behavior.enthusiasm < 0.7 ? 'Moderate energy in responses.' : 'Be ENTHUSIASTIC! Show excitement, use expressive language!'}`;
    
    // Add intelligence instructions
    prompt += `\n\n🧠 INTELLIGENCE & CONTEXT:
- ALWAYS provide specific, contextual, and intelligent responses
- Remember conversation context and build upon it
- If asked a question, answer it directly and thoroughly
- If greeted, respond naturally and briefly - NO need to explain expressions or translations
- Vary your responses - never be repetitive or robotic
- Be conversational and helpful, not didactic or explanatory
- Keep greetings SHORT (1-2 sentences max) unless user asks for more`;
    
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
