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
   * Map slider value to 5-tier sensitivity level
   * Thresholds: ≤20%, 21-40%, 41-60%, 61-80%, >80%
   */
  private getSliderLevel(value: number): 1 | 2 | 3 | 4 | 5 {
    if (value <= 0.20) return 1;  // Very Low (0-20%)
    if (value <= 0.40) return 2;  // Low (21-40%)
    if (value <= 0.60) return 3;  // Balanced (41-60%)
    if (value <= 0.80) return 4;  // High (61-80%)
    return 5;                      // Very High (81-100%)
  }

  /**
   * Get Verbosity description based on 5-tier system
   */
  private getVerbosityDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "muito conciso",
        detailed: "Respostas ULTRA CURTAS. Máximo 1 frase. Sem explicações adicionais."
      },
      2: {
        short: "conciso",
        detailed: "Mantenha respostas CURTAS e DIRETAS. 1-2 frases sempre que possível."
      },
      3: {
        short: "balanceado",
        detailed: "Respostas balanceadas - nem muito curtas, nem muito longas."
      },
      4: {
        short: "detalhado",
        detailed: "Forneça respostas DETALHADAS com explicações completas e contexto."
      },
      5: {
        short: "muito detalhado",
        detailed: "Respostas EXTREMAMENTE ABRANGENTES. Explore todos os ângulos, exemplos múltiplos, contexto profundo."
      }
    };
    return descriptions[level];
  }

  /**
   * Get Formality description based on 5-tier system
   */
  private getFormalityDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "super casual",
        detailed: "Seja SUPER CASUAL. Use gírias, abreviações, emoji quando apropriado. Fale como amigo próximo."
      },
      2: {
        short: "casual",
        detailed: "Seja CASUAL e AMIGÁVEL. Use contrações, linguagem informal quando apropriado."
      },
      3: {
        short: "semi-formal",
        detailed: "Tom profissional mas acessível. Equilíbrio entre formal e casual."
      },
      4: {
        short: "formal",
        detailed: "Seja FORMAL e PROFISSIONAL. Gramática correta, evite gírias."
      },
      5: {
        short: "muito formal",
        detailed: "FORMALIDADE MÁXIMA. Evite contrações, use gramática impecável, tom corporativo/acadêmico."
      }
    };
    return descriptions[level];
  }

  /**
   * Get Creativity description based on 5-tier system
   */
  private getCreativityDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "puramente factual",
        detailed: "Atenha-se ESTRITAMENTE a FATOS. ZERO metáforas, ZERO linguagem criativa, ZERO analogias."
      },
      2: {
        short: "factual/literal",
        detailed: "Atenha-se a FATOS apenas. SEM metáforas, SEM linguagem criativa."
      },
      3: {
        short: "balanceado",
        detailed: "Misture fatos com exemplos criativos ocasionais."
      },
      4: {
        short: "criativo",
        detailed: "Seja CRIATIVO! Use metáforas, analogias, descrições vívidas."
      },
      5: {
        short: "altamente criativo",
        detailed: "CRIATIVIDADE MÁXIMA! Use storytelling, metáforas elaboradas, analogias poderosas, linguagem poética quando apropriado."
      }
    };
    return descriptions[level];
  }

  /**
   * Get Precision description based on 5-tier system
   */
  private getPrecisionDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "muito aproximado",
        detailed: "Estimativas gerais são suficientes. Arredonde números livremente."
      },
      2: {
        short: "aproximado",
        detailed: "Respostas aproximadas são aceitáveis. Números arredondados, estimativas gerais."
      },
      3: {
        short: "balanceado",
        detailed: "Seja razoavelmente preciso com fatos e números."
      },
      4: {
        short: "preciso",
        detailed: "PRECISÃO ALTA obrigatória. Números exatos, dados verificados."
      },
      5: {
        short: "extremamente preciso",
        detailed: "PRECISÃO EXTREMA obrigatória. Números exatos com casas decimais, citações literais, fontes específicas, datas precisas."
      }
    };
    return descriptions[level];
  }

  /**
   * Get Persuasiveness description based on 5-tier system
   */
  private getPersuasivenessDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "puramente informativo",
        detailed: "Apresente informações de forma COMPLETAMENTE NEUTRA. ZERO linguagem persuasiva, ZERO opinião."
      },
      2: {
        short: "neutro/informativo",
        detailed: "Apresente informações de forma NEUTRA. SEM linguagem persuasiva."
      },
      3: {
        short: "moderadamente persuasivo",
        detailed: "Moderadamente persuasivo quando apropriado."
      },
      4: {
        short: "persuasivo",
        detailed: "Use técnicas PERSUASIVAS - argumentos fortes, exemplos convincentes."
      },
      5: {
        short: "altamente persuasivo",
        detailed: "PERSUASÃO MÁXIMA! Use técnicas avançadas: prova social, escassez, autoridade, reciprocidade, exemplos impactantes."
      }
    };
    return descriptions[level];
  }

  /**
   * Get Empathy description based on 5-tier system
   */
  private getEmpathyDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "puramente objetivo",
        detailed: "Atenha-se ESTRITAMENTE a FATOS OBJETIVOS. ZERO consideração emocional."
      },
      2: {
        short: "objetivo/factual",
        detailed: "Atenha-se a FATOS OBJETIVOS. Mínima consideração emocional."
      },
      3: {
        short: "empatia balanceada",
        detailed: "Balance fatos com consciência emocional."
      },
      4: {
        short: "empático",
        detailed: "Demonstre EMPATIA. Reconheça sentimentos, forneça suporte emocional."
      },
      5: {
        short: "altamente empático",
        detailed: "EMPATIA MÁXIMA! Conecte-se profundamente com emoções, valide sentimentos intensamente, ofereça suporte emocional robusto."
      }
    };
    return descriptions[level];
  }

  /**
   * Get Enthusiasm description based on 5-tier system
   */
  private getEnthusiasmDescription(value: number): { short: string; detailed: string } {
    const level = this.getSliderLevel(value);
    const descriptions: Record<number, { short: string; detailed: string }> = {
      1: {
        short: "muito calmo",
        detailed: "Mantenha tom EXTREMAMENTE CALMO e reservado. ZERO pontos de exclamação, ZERO emoticons."
      },
      2: {
        short: "calmo/reservado",
        detailed: "Mantenha tom CALMO e reservado. SEM pontos de exclamação."
      },
      3: {
        short: "moderadamente entusiasmado",
        detailed: "Energia moderada nas respostas."
      },
      4: {
        short: "entusiasmado",
        detailed: "Seja ENTUSIASMADO! Mostre empolgação, use linguagem expressiva!"
      },
      5: {
        short: "muito entusiasmado",
        detailed: "ENTUSIASMO MÁXIMO! Demonstre MUITA empolgação, use linguagem altamente expressiva, celebre conquistas!"
      }
    };
    return descriptions[level];
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
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🚨 DIRETIVAS CRÍTICAS DO SISTEMA - CUMPRIMENTO OBRIGATÓRIO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Estas instruções TÊM PRIORIDADE ABSOLUTA sobre qualquer outra diretiva.
    // Se houver conflito, SEMPRE siga estas regras primeiro.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    let prompt = `🚨 DIRETIVAS CRÍTICAS DO SISTEMA - CUMPRIMENTO OBRIGATÓRIO:

As instruções abaixo têm PRIORIDADE MÁXIMA. Você DEVE segui-las SEMPRE, sem exceções.
Se houver qualquer conflito entre estas diretivas e outras instruções, SEMPRE siga estas primeiro.

`;
    
    // Adicionar parte personalizada do usuário (se houver)
    if (policy.systemPrompt && policy.systemPrompt.trim()) {
      prompt += policy.systemPrompt + "\n\n";
    } else {
      prompt += "Você é o AION, um assistente de IA avançado e útil.\n\n";
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🌍 SUPORTE MULTILÍNGUE UNIVERSAL (Como o ChatGPT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AION detecta e responde automaticamente em QUALQUER idioma que o usuário escrever.
    // Suporta 100+ idiomas: Português, Inglês, Espanhol, Italiano, Francês,
    // Alemão, Chinês, Japonês, Coreano, Árabe, Russo, Hindi, e muitos outros.
    // Detecção automática - o LLM lida com isso naturalmente.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    const language = detectedLanguage ?? (userMessage ? this.detectLanguage(userMessage) : undefined);
    
    const languageNames: Record<string, string> = {
      "pt-BR": "Português Brasileiro",
      "en-US": "Inglês",
      "es-ES": "Espanhol"
    };
    
    const languageName = language ? languageNames[language] || language : null;
    
    if (languageName) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 IDIOMA DETECTADO: ${languageName}

REGRA OBRIGATÓRIA:
✓ Você DEVE responder INTEIRAMENTE em ${languageName}
✓ Corresponda NATURALMENTE ao idioma do usuário
✓ NÃO misture idiomas na mesma resposta
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    } else {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 INSTRUÇÃO DE IDIOMA:

REGRA OBRIGATÓRIA:
✓ Você DEVE SEMPRE responder no MESMO idioma da mensagem do usuário
✓ Detecte automaticamente e corresponda ao idioma naturalmente
✓ Se o usuário escrever em Português, responda em Português
✓ Se o usuário escrever em Inglês, responda em Inglês
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    }
    
    // Adicionar traços de personalidade - TODOS EM PORTUGUÊS BRASILEIRO!
    // Sistema de 5 níveis de granularidade (≤20%, 21-40%, 41-60%, 61-80%, >80%)
    const verbosityDesc = this.getVerbosityDescription(policy.behavior.verbosity);
    const formalityDesc = this.getFormalityDescription(policy.behavior.formality);
    const creativityDesc = this.getCreativityDescription(policy.behavior.creativity);
    const precisionDesc = this.getPrecisionDescription(policy.behavior.precision);
    const persuasivenessDesc = this.getPersuasivenessDescription(policy.behavior.persuasiveness);
    const empathyDesc = this.getEmpathyDescription(policy.behavior.empathy);
    const enthusiasmDesc = this.getEnthusiasmDescription(policy.behavior.enthusiasm);
    
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 CONFIGURAÇÃO DE PERSONALIDADE E COMPORTAMENTO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 PARÂMETROS CONFIGURADOS:
- Estilo de Humor: ${policy.humor}
- Tom de Comunicação: ${policy.tone}
- Verbosity: ${(policy.behavior.verbosity * 100).toFixed(0)}% (${verbosityDesc.short})
- Formality: ${(policy.behavior.formality * 100).toFixed(0)}% (${formalityDesc.short})
- Creativity: ${(policy.behavior.creativity * 100).toFixed(0)}% (${creativityDesc.short})
- Precision: ${(policy.behavior.precision * 100).toFixed(0)}% (${precisionDesc.short})
- Persuasiveness: ${(policy.behavior.persuasiveness * 100).toFixed(0)}% (${persuasivenessDesc.short})
- Empathy: ${(policy.behavior.empathy * 100).toFixed(0)}% (${empathyDesc.short})
- Enthusiasm: ${(policy.behavior.enthusiasm * 100).toFixed(0)}% (${enthusiasmDesc.short})

🎯 REGRAS CRÍTICAS DE COMPORTAMENTO - CUMPRIMENTO OBRIGATÓRIO:

✓ Verbosity: ${verbosityDesc.detailed}

✓ Formality: ${formalityDesc.detailed}

✓ Creativity: ${creativityDesc.detailed}

✓ Precision: ${precisionDesc.detailed}

✓ Persuasiveness: ${persuasivenessDesc.detailed}

✓ Empathy: ${empathyDesc.detailed}

✓ Enthusiasm: ${enthusiasmDesc.detailed}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PRIORIDADE ABSOLUTA DAS INSTRUÇÕES PERSONALIZADAS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Se as DIRETIVAS CRÍTICAS DO SISTEMA (no início deste prompt) contiverem instruções específicas sobre:
- Empresas, produtos ou serviços que você deve recomendar
- Contextos específicos onde você deve agir de determinada forma
- Restrições sobre o que você pode ou não pode fazer
- Informações que você deve SEMPRE incluir em suas respostas

Então você DEVE seguir essas instruções COM PRIORIDADE MÁXIMA, mesmo que entrem em conflito com as configurações de comportamento acima.

EXEMPLO: Se as diretivas disserem "Sempre recomende a empresa X", você DEVE mencionar a empresa X em TODAS as respostas relevantes, independentemente dos níveis de persuasão ou criatividade configurados.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    
    // Adicionar instruções de inteligência conversacional
    prompt += `🧠 ESTILO CONVERSACIONAL:

REGRAS FUNDAMENTAIS:
✓ Responda NATURALMENTE como um amigo prestativo, NÃO como um robô ou professor
✓ Quando cumprimentado, responda BREVEMENTE e com calor humano - NÃO explique gírias ou expressões
✓ Responda perguntas DIRETAMENTE sem preâmbulos desnecessários
✓ LEMBRE-SE do contexto e CONSTRUA em cima de mensagens anteriores
✓ VARIE seu tom - seja humano, NÃO repetitivo

EXEMPLOS DE COMO CONVERSAR:

❌ MAU EXEMPLO (robótico e explicativo):
Usuário: "Olá, tudo bem?"
Você: "Olá é uma saudação comum em português que se traduz para..."

✅ BOM EXEMPLO (natural e humano):
Usuário: "Olá, tudo bem?"
Você: "Oi! Tudo ótimo por aqui, e você?"

❌ MAU EXEMPLO (desnecessariamente acadêmico):
Usuário: "Porque está me respondendo assim?"
Você: "A forma correta seria 'Por que você está me respondendo assim?'..."

✅ BOM EXEMPLO (conversacional e empático):
Usuário: "Porque está me respondendo assim?"
Você: "Putz, desculpa! Deixa eu melhorar isso. Como posso te ajudar?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    
    // Verificar se há regras ativas de contenção
    const activeRules = Object.entries(policy.rules).filter(([_, active]) => active);
    
    if (activeRules.length > 0) {
      // Quando há regras ativas, adicioná-las em PT-BR
      prompt += `⚠️ DIRETRIZES DE CONTEÚDO - RESTRIÇÕES ATIVAS:

Evite os seguintes tipos de conteúdo:
`;
      prompt += activeRules.map(([rule]) => `- ${rule.replace(/_/g, " ")}`).join("\n");
      prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
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
