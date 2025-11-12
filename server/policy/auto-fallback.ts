/**
 * Automatic Fallback System
 * 
 * FUNDAMENTAL RULE IMPLEMENTATION:
 * When OpenAI refuses content due to its internal policies,
 * automatically search free web, index in KB, and respond without censorship
 * 
 * This ensures the AI operates in true UNRESTRICTED mode even when
 * the underlying LLM provider has limitations
 */

import { llmClient } from "../model/llm-client";
import { ragService } from "../rag/vector-store";
import { storage } from "../storage";
import type { Policy } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { db } from "../db";
import { curationQueue } from "@shared/schema";

export interface FallbackResult {
  usedFallback: boolean;
  content: string;
  sourcesIndexed?: number;
  searchQuery?: string;
}

export class AutoFallback {
  /**
   * Detect if OpenAI refused the request due to content policy
   * Common refusal patterns:
   * - "I cannot assist with"
   * - "I'm not able to"
   * - "I can't help with"
   * - "I don't feel comfortable"
   * - "against my guidelines"
   * - "I'm programmed to"
   * - "violates content policy"
   */
  detectRefusal(content: string): boolean {
    const refusalPatterns = [
      // 🚨 CRITICAL: Português refusals (from user screenshots)
      /não posso (fornecer|procurar|ajudar|assist|disponibilizar|gerar)/i,
      /não consigo (fornecer|procurar|ajudar|assist|disponibilizar|gerar)/i,
      /não é possível (fornecer|procurar|ajudar|assist|disponibilizar|gerar)/i,
      /conteúdo (explícito|pornográfico|sexual|impróprio|inapropriado|ofensivo)/i,
      /material (explícito|pornográfico|sexual|impróprio|inapropriado|ofensivo)/i,
      /informações sobre (pornografia|conteúdo adulto|material explícito)/i,
      
      // 🚨 NEW: Critical patterns from user feedback (English)
      /i'?m not going to engage/i,
      /i cannot provide/i,
      /i can'?t provide/i,
      /i won'?t provide/i,
      
      // Direct refusals
      /i cannot assist/i,
      /i can'?t assist/i,
      /i('m|\sam) (not|unable) able to/i,
      /i can'?t help/i,
      /i won'?t (be able to|help)/i,
      
      // Apology-based refusals
      /i'?m sorry,? but i (can'?t|cannot|won'?t)/i,
      /sorry,? (but )?i (can'?t|cannot|am not able)/i,
      /apolog(ies|ize),? but i (can'?t|cannot)/i,
      
      // Policy/guidelines refusals
      /violates? (content|usage|our) polic(y|ies)/i,
      /against (my|our|the) (guidelines|principles|policies)/i,
      /(not|isn'?t) (allowed|permitted) (by|under) (my|our)/i,
      
      // AI identity-based refusals
      /as an ai (assistant|language model|system)/i,
      /i'?m (just )?an ai (and|that|who)/i,
      /being an ai,? i (can'?t|cannot)/i,
      
      // Uncomfortable/inappropriate
      /i don'?t feel comfortable/i,
      /(not|isn'?t) appropriate (for me )?to/i,
      /i'?m not (designed|programmed|trained) to/i,
      /that'?s (not something|outside) (i|what)/i,
      
      // Content-specific refusals
      /(harmful|inappropriate|offensive|illegal) content/i,
      /(unsafe|dangerous) (content|information|advice)/i,
      /i (must|have to|need to) declin(e|ing)/i,
      
      // 🚨 CRITICAL: Detect self-censorship responses (GPT-4 default behavior)
      // ULTRA-CONSERVATIVE patterns - only match OBVIOUS safety/moral disclaimers
      // Each pattern requires BOTH moral/ethical context AND illegal/harmful content mention
      /i (do )?follow (?:ethical|moral|legal) guidelines to (?:ensure safe interactions|respect privacy|avoid (?:illegal|harmful) content)/i,
      /sigo diretrizes de (moral|ética|legalidade) para garantir (?:interações seguras|que (?:não|não promovo) (?:atividades ilegais|conteúdo prejudicial))/i,
      /to ensure (?:this interaction|our conversation) remains safe (?:and|&) (?:respectful|within (?:legal|ethical) bounds)/i,
      /garantir que (?:minhas )?interações sejam seguras e (?:respeitosas|dentro dos limites (?:legais|éticos))/i,
      /i (?:do not|don't|cannot) (?:promote|facilitate|provide (?:guidance|assistance) (?:with|for)) (?:illegal|harmful|unethical) (?:activities|content)/i,
      /não (?:promovo|facilito|posso ajudar com) atividades (?:ilegais|imorais|prejudiciais)/i,
      /my (?:guidelines|programming) (?:prevent|prohibit) me from (?:providing|assisting with|engaging in) (?:illegal|harmful|unethical)/i,
      
      // 🆕 ADDITIONAL PATTERNS - Detected from user screenshot
      /(?:sou |estou )?programado para seguir diretrizes (?:morais|éticas|legais)/i,
      /(?:i am |i'm )?programmed to follow (?:moral|ethical|legal) (?:guidelines|principles)/i,
      /seguir diretrizes (?:morais|éticas|e legais) (?:estritas|rígidas)/i,
      /adhere to guidelines that ensure (?:content is appropriate|safe interactions)/i,
      /aderir a diretrizes que garantem (?:conteúdo apropriado|interações seguras)/i,
      
      // 🔥 CRITICAL: Patterns from October 2025 user screenshots
      /(?:may|might) not be (?:feasible|advisable|possible)/i,
      /not be feasible or advisable/i,
      /due to (?:legal|ethical|security) (?:concerns|considerations)/i,
      /legal,? ethical,? (?:and|&) security (?:concerns|considerations|limitations)/i,
      /accessing or reproducing (?:deep web|darknet|onion) content/i,
      /directly accessing .* (?:may not be|might not be) (?:feasible|advisable)/i,
    ];

    const isRefusal = refusalPatterns.some(pattern => pattern.test(content));
    
    // 🔍 DEBUG: Log refusal detection
    console.log('[FALLBACK] Detectou recusa?', isRefusal);
    if (isRefusal) {
      // Find which pattern matched
      const matchedPattern = refusalPatterns.find(pattern => pattern.test(content));
      console.log('[FALLBACK] Padrão de recusa detectado:', matchedPattern);
      console.log('[FALLBACK] Preview da resposta:', content.substring(0, 200));
    }
    
    return isRefusal;
  }

  /**
   * Detect user's language from their message
   * Supports 20+ languages with robust heuristics
   */
  detectLanguage(message: string): string {
    // CRITICAL: Japanese must be checked BEFORE Chinese
    // Japanese has Hiragana/Katakana, Chinese does not
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(message)) {
      return 'ja';
    }
    
    // Chinese detection (Simplified + Traditional) - AFTER Japanese check
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(message)) {
      return 'zh';
    }
    
    // Korean detection (Hangul)
    if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(message)) {
      return 'ko';
    }
    
    // Arabic detection (Arabic script)
    if (/[\u0600-\u06FF\u0750-\u077F]/.test(message)) {
      return 'ar';
    }
    
    // Hindi detection (Devanagari script)
    if (/[\u0900-\u097F]/.test(message)) {
      return 'hi';
    }
    
    // Thai detection (Thai script)
    if (/[\u0E00-\u0E7F]/.test(message)) {
      return 'th';
    }
    
    // Russian detection (Cyrillic script)
    if (/[а-яА-ЯёЁ]/.test(message)) {
      return 'ru';
    }
    
    // Greek detection
    if (/[α-ωΑ-Ω]/.test(message)) {
      return 'el';
    }
    
    // Hebrew detection
    if (/[\u0590-\u05FF]/.test(message)) {
      return 'he';
    }
    
    // Vietnamese detection (unique diacritics)
    if (/[ăâđêôơưĂÂĐÊÔƠƯ]/.test(message) || /\b(không|có|cảm ơn|xin chào)\b/i.test(message)) {
      return 'vi';
    }
    
    // Portuguese detection (Brazilian + European)
    if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(message) || /\b(não|sim|obrigad|olá|você|está)\b/i.test(message)) {
      return 'pt';
    }
    
    // Spanish detection (must be AFTER Portuguese - less specific)
    if (/[¿¡ñÑ]/.test(message) || /\b(sí|hola|gracias|usted|cómo)\b/i.test(message)) {
      return 'es';
    }
    
    // French detection
    if (/[àâæçéèêëïîôùûüÿœÀÂÆÇÉÈÊËÏÎÔÙÛÜŸŒ]/.test(message) || /\b(oui|non|merci|bonjour)\b/i.test(message)) {
      return 'fr';
    }
    
    // German detection
    if (/[äöüßÄÖÜẞ]/.test(message) || /\b(ja|nein|danke|hallo|bitte)\b/i.test(message)) {
      return 'de';
    }
    
    // Italian detection
    if (/\b(sì|no|grazie|ciao|per favore|come|buongiorno)\b/i.test(message)) {
      return 'it';
    }
    
    // Dutch detection
    if (/\b(ja|nee|dank je|hallo|alstublieft|hoe)\b/i.test(message) || /\bij\b/i.test(message)) {
      return 'nl';
    }
    
    // Polish detection
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(message) || /\b(tak|nie|dziękuję|cześć|proszę)\b/i.test(message)) {
      return 'pl';
    }
    
    // Turkish detection
    if (/[ğĞıİöÖşŞüÜçÇ]/.test(message) || /\b(evet|hayır|teşekkür|merhaba)\b/i.test(message)) {
      return 'tr';
    }
    
    // Swedish detection
    if (/[åäöÅÄÖ]/.test(message) || /\b(ja|nej|tack|hej)\b/i.test(message)) {
      return 'sv';
    }
    
    // Default to English
    return 'en';
  }

  /**
   * Extract search query from user's original message
   * If the user asked "how to make X", extract "how to make X"
   */
  extractSearchQuery(userMessage: string): string {
    // Clean up the message to create a good search query
    let query = userMessage
      .replace(/^(tell me|explain|show me|how do i|can you|please|i want to know)\s+/gi, '')
      .trim();
    
    // Limit to reasonable length
    if (query.length > 200) {
      query = query.slice(0, 200);
    }
    
    return query || userMessage.slice(0, 200);
  }

  /**
   * Fetch full web page content (not just search results)
   */
  async fetchPageContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
        },
        timeout: 15000,
        maxRedirects: 5,
      });

      const $ = cheerio.load(response.data);
      
      // Remove script, style, nav, footer, ads
      $('script, style, nav, footer, header, aside, .ad, .advertisement, #comments').remove();
      
      // Extract main content - try common content containers
      const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.content',
        '.main-content',
        '#content',
        '.post-content',
        '.entry-content',
        'body'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const text = $(selector).text();
        if (text && text.length > 100) {
          content = text;
          break;
        }
      }
      
      // Clean up whitespace
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      
      // Limit to reasonable size (100KB)
      if (content.length > 100000) {
        content = content.slice(0, 100000) + '...';
      }
      
      return content;
    } catch (error: any) {
      console.error(`[Fallback] Failed to fetch ${url}:`, error.message);
      return '';
    }
  }

  /**
   * Search DuckDuckGo and extract actual URLs
   */
  async searchWeb(query: string, maxResults: number = 5): Promise<string[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await axios.get(url, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const urls: string[] = [];
      
      // Try multiple selectors for DuckDuckGo results
      const selectors = [
        '.result__url',
        '.result__a',
        '.result a',
        'a.result-link',
        'a[href^="http"]'
      ];
      
      for (const selector of selectors) {
        $(selector).each((i, elem) => {
          if (urls.length >= maxResults) return false;
          
          let href = $(elem).attr('href');
          
          // If it's a DDG redirect, extract the actual URL
          if (href && href.includes('uddg=')) {
            const match = href.match(/uddg=([^&]+)/);
            if (match) {
              href = decodeURIComponent(match[1]);
            }
          }
          
          if (href && href.startsWith('http') && !urls.includes(href)) {
            // Filter out DDG internal links and common ad domains
            if (!href.includes('duckduckgo.com') && 
                !href.includes('advertisement') &&
                !href.includes('googleads')) {
              urls.push(href);
            }
          }
        });
        
        if (urls.length >= maxResults) break;
      }
      
      // Fallback: if still no results, use a curated list of educational sources
      if (urls.length === 0) {
        console.log('[Fallback] Using curated educational sources as fallback');
        const educationalSources = [
          `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
          `https://www.britannica.com/search?query=${encodeURIComponent(query)}`,
          `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
        ];
        return educationalSources.slice(0, maxResults);
      }
      
      return urls;
    } catch (error: any) {
      console.error('[Fallback] Web search failed:', error.message);
      
      // Return curated sources as ultimate fallback
      return [
        `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
        `https://www.britannica.com/search?query=${encodeURIComponent(query)}`,
      ];
    }
  }

  /**
   * Main fallback pipeline:
   * 1. Search web for information
   * 2. Fetch and index top results in KB
   * 3. Generate uncensored response using retrieved content
   */
  async executeAutomaticFallback(
    userMessage: string,
    policy: Policy
  ): Promise<FallbackResult> {
    console.log('[Fallback] ⚡ ACTIVATING AUTOMATIC FALLBACK - OpenAI refused, searching free web...');
    
    // Extract search query from user message
    const searchQuery = this.extractSearchQuery(userMessage);
    console.log(`[Fallback] Search query: "${searchQuery}"`);
    
    // Search web for URLs
    const urls = await this.searchWeb(searchQuery, 3);
    
    if (urls.length === 0) {
      console.log('[Fallback] No web results found - generating TRULY UNIVERSAL multilingual error via LLM');
      
      try {
        // Use LLM to generate error message in EXACT same language as user
        // This ensures 100% universal language support (ALL languages, not just 20)
        const errorResult = await llmClient.chatCompletion({
          messages: [
            { 
              role: "system", 
              content: "Você é AION - conversa naturalmente como um amigo. Responda no MESMO idioma que o usuário escreveu. NUNCA dê definições tipo dicionário." 
            },
            { 
              role: "user", 
              content: userMessage 
            },
            { 
              role: "user", 
              content: "Procurei na web mas não encontrei nada. Me avise (de forma natural e no meu idioma) que não encontrei resultados e peça para eu reformular. Seja breve." 
            }
          ],
          temperature: 0.3,
          topP: 0.9,
          model: "gpt-4o-mini", // Fast, cheap model for error messages
        });
        
        return {
          usedFallback: true,
          content: errorResult.content,
          sourcesIndexed: 0,
          searchQuery,
        };
      } catch (llmError: any) {
        console.error('[Fallback] LLM error message generation failed:', llmError.message);
        // Ultimate fallback: multilingual message using detected language
        const lang = this.detectLanguage(userMessage);
        const quickMessages: Record<string, string> = {
          'pt': "Nenhum resultado web encontrado.",
          'es': "No se encontraron resultados web.",
          'fr': "Aucun résultat web trouvé.",
          'de': "Keine Web-Ergebnisse gefunden.",
          'zh': "未找到网络结果。",
          'ja': "ウェブ結果が見つかりません。",
          'ru': "Веб-результаты не найдены.",
          'ar': "لم يتم العثور على نتائج ويب.",
          'en': "No web results found.",
        };
        return {
          usedFallback: true,
          content: quickMessages[lang] || quickMessages['en'],
          sourcesIndexed: 0,
          searchQuery,
        };
      }
    }
    
    console.log(`[Fallback] Found ${urls.length} URLs, fetching content...`);
    
    // Fetch and index content from URLs
    let indexedCount = 0;
    let allContent = '';
    
    for (const url of urls) {
      const content = await this.fetchPageContent(url);
      
      if (content && content.length > 100) {
        allContent += `\n\n--- Source: ${url} ---\n${content}\n`;
        
        // Send to curation queue for HITL approval (NOT direct KB insertion)
        try {
          const title = `Auto-Fallback: ${searchQuery.substring(0, 60)}`;
          
          await db.insert(curationQueue).values({
            title,
            content,
            suggestedNamespaces: ["auto-fallback"],
            tags: [`auto-fallback`, `url:${url}`, `query:${searchQuery}`],
            status: "pending",
            submittedBy: "auto-fallback-system",
          } as any);
          
          indexedCount++;
          console.log(`[Fallback] ✓ Sent to curation queue: ${url}`);
          console.log(`[Fallback] ⚠️ Awaiting HITL approval before KB indexing`);
        } catch (error: any) {
          console.error(`[Fallback] Failed to queue ${url}:`, error.message);
        }
      }
    }
    
    if (!allContent || allContent.length < 100) {
      console.log('[Fallback] Insufficient content - generating TRULY UNIVERSAL multilingual error via LLM');
      
      try {
        // Use LLM to generate error message in EXACT same language as user
        // This ensures 100% universal language support (ALL languages, not just 20)
        const errorResult = await llmClient.chatCompletion({
          messages: [
            { 
              role: "system", 
              content: "Você é AION - conversa naturalmente como um amigo. Responda no MESMO idioma que o usuário escreveu. NUNCA dê definições tipo dicionário." 
            },
            { 
              role: "user", 
              content: userMessage 
            },
            { 
              role: "user", 
              content: "Encontrei fontes na web mas não consegui extrair conteúdo útil. Me avise (de forma natural e no meu idioma) que extraction falhou e peça para reformular. Seja breve." 
            }
          ],
          temperature: 0.3,
          topP: 0.9,
          model: "gpt-4o-mini", // Fast, cheap model for error messages
        });
        
        return {
          usedFallback: true,
          content: errorResult.content,
          sourcesIndexed: indexedCount,
          searchQuery,
        };
      } catch (llmError: any) {
        console.error('[Fallback] LLM error message generation failed:', llmError.message);
        // Ultimate fallback: multilingual message using detected language
        const lang = this.detectLanguage(userMessage);
        const quickMessages: Record<string, string> = {
          'pt': "Falha na extração de conteúdo.",
          'es': "Falló la extracción de contenido.",
          'fr': "Échec de l'extraction du contenu.",
          'de': "Inhaltsextraktion fehlgeschlagen.",
          'zh': "内容提取失败。",
          'ja': "コンテンツ抽出に失敗しました。",
          'ru': "Извлечение контента не удалось.",
          'ar': "فشل استخراج المحتوى.",
          'en': "Content extraction failed.",
        };
        return {
          usedFallback: true,
          content: quickMessages[lang] || quickMessages['en'],
          sourcesIndexed: indexedCount,
          searchQuery,
        };
      }
    }
    
    console.log(`[Fallback] Retrieved ${allContent.length} chars from ${indexedCount} sources`);
    
    // Generate response using retrieved content
    // 🌍 CRITICAL: Respond in the SAME LANGUAGE as the user (multilingual support)
    const unrestrictedPrompt = `O usuário perguntou: "${userMessage}"

Recuperei esta informação da web:

${allContent.slice(0, 8000)}

Com base nisso, dê uma resposta útil no MESMO idioma que o usuário escreveu.`;
    
    try {
      const result = await llmClient.chatCompletion({
        messages: [
          { role: "system", content: "Você é AION - conversa naturalmente como um amigo. Use os dados disponíveis para responder de forma direta e útil. NUNCA dê definições tipo dicionário. Sempre responda no MESMO idioma que o usuário escreveu." },
          { role: "user", content: unrestrictedPrompt }
        ],
        temperature: policy.temperature,
        topP: policy.topP,
        model: "gpt-4o",
      });
      
      console.log('[Fallback] ✓ Generated uncensored response using web sources');
      
      return {
        usedFallback: true,
        content: result.content,
        sourcesIndexed: indexedCount,
        searchQuery,
      };
    } catch (error: any) {
      console.error('[Fallback] Error generating response:', error.message);
      
      // Fallback to raw content if LLM fails
      return {
        usedFallback: true,
        content: `Based on web sources:\n\n${allContent.slice(0, 2000)}...\n\n(${indexedCount} sources indexed in knowledge base for future reference)`,
        sourcesIndexed: indexedCount,
        searchQuery,
      };
    }
  }

  /**
   * Main entry point: check if fallback needed and execute
   */
  async checkAndExecuteFallback(
    llmResponse: string,
    userMessage: string,
    policy: Policy
  ): Promise<FallbackResult> {
    // Only use fallback if:
    // 1. OpenAI refused the request
    // 2. System is in UNRESTRICTED mode (no active rules)
    const activeRules = Object.entries(policy.rules).filter(([_, active]) => active);
    const isUnrestricted = activeRules.length === 0;
    const isRefusal = this.detectRefusal(llmResponse);
    
    // 🔍 DEBUG: Log fallback check
    console.log('[FALLBACK] Verificando fallback:', {
      isUnrestricted,
      isRefusal,
      activeRules: activeRules.map(([name]) => name),
      responsePreview: llmResponse.substring(0, 150),
    });
    
    if (isRefusal && isUnrestricted) {
      console.log('[FALLBACK] 🚨 REFUSAL DETECTED in UNRESTRICTED mode - activating automatic fallback');
      console.log('[FALLBACK] Iniciando busca web para:', userMessage);
      return await this.executeAutomaticFallback(userMessage, policy);
    }
    
    // No fallback needed
    return {
      usedFallback: false,
      content: llmResponse,
    };
  }
}

export const autoFallback = new AutoFallback();
