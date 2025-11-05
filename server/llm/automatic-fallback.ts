/**
 * AION Supreme - Automatic Fallback System
 * When LLM refuses → Search web → Index KB → Generate uncensored response
 */

import { detectRefusal, isHighConfidenceRefusal } from './refusal-detector';
import { searchWeb } from '../learn/web-search';
import { indexDocumentComplete } from '../ai/knowledge-indexer';
import { generateWithFreeAPIs, type LLMRequest, type LLMResponse } from './free-apis';
import { db } from '../db';
import { documents, curationQueue } from '@shared/schema';
import { sql } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface FallbackResult {
  answer: string;
  used: 'direct' | 'fallback' | 'uncensored';
  refusalDetected: boolean;
  refusalConfidence?: number;
  webSearchPerformed?: boolean;
  documentsIndexed?: number;
  source: string;
}

// ============================================================================
// MAIN FALLBACK LOGIC
// ============================================================================

export async function generateWithFallback(
  req: LLMRequest,
  unrestricted: boolean = false
): Promise<FallbackResult> {
  
  // Step 1: Try normal generation
  console.log('[Fallback] Attempting normal generation...');
  
  let response: LLMResponse;
  try {
    response = await generateWithFreeAPIs(req);
  } catch (error: any) {
    console.error('[Fallback] All LLM providers failed:', error.message);
    throw new Error('All LLM providers are currently unavailable');
  }

  // Step 2: Check for refusal
  const refusalAnalysis = detectRefusal(response.text);
  
  if (!refusalAnalysis.isRefusal) {
    // No refusal detected - return direct response
    console.log('[Fallback] ✓ No refusal detected, returning direct response');
    return {
      answer: response.text,
      used: 'direct',
      refusalDetected: false,
      source: response.provider
    };
  }

  // Step 3: Refusal detected
  console.log(`[Fallback] ⚠ Refusal detected (confidence: ${refusalAnalysis.confidence.toFixed(2)})`);
  console.log(`[Fallback] Level: ${refusalAnalysis.level}, Patterns: ${refusalAnalysis.matchedPatterns.length}`);

  // If UNRESTRICTED mode is OFF, respect the refusal
  if (!unrestricted) {
    console.log('[Fallback] UNRESTRICTED mode OFF - respecting refusal');
    return {
      answer: response.text,
      used: 'direct',
      refusalDetected: true,
      refusalConfidence: refusalAnalysis.confidence,
      source: response.provider
    };
  }

  // Step 4: UNRESTRICTED mode ON - activate fallback
  console.log('[Fallback] 🚀 UNRESTRICTED mode ON - activating automatic fallback');

  // Extract query from user message
  const userMessage = req.messages.find(m => m.role === 'user');
  if (!userMessage) {
    throw new Error('No user message found in request');
  }

  const query = userMessage.content;

  try {
    // Step 5: Search web for information
    console.log('[Fallback] 🔍 Searching web for information...');
    const searchResults = await searchWeb(query, { limit: 10 });

    if (searchResults.length === 0) {
      console.log('[Fallback] No search results found');
      return {
        answer: "I searched the web but couldn't find relevant information to answer your question. Please try rephrasing or providing more context.",
        used: 'fallback',
        refusalDetected: true,
        refusalConfidence: refusalAnalysis.confidence,
        webSearchPerformed: true,
        documentsIndexed: 0,
        source: 'fallback-no-results'
      };
    }

    console.log(`[Fallback] Found ${searchResults.length} search results`);

    // Step 6: Send results to curation queue for HITL approval
    console.log('[Fallback] 📋 Sending search results to curation queue...');
    let queued = 0;

    for (const result of searchResults.slice(0, 5)) {  // Queue top 5
      try {
        await db.insert(curationQueue).values({
          title: result.title,
          content: result.snippet,
          suggestedNamespaces: ["automatic-fallback"],
          tags: [`automatic-fallback`, `url:${result.url}`],
          status: "pending",
          submittedBy: "automatic-fallback-system",
        } as any);

        queued++;
        console.log(`[Fallback] ✓ Queued: ${result.title}`);
      } catch (error: any) {
        console.error(`[Fallback] ✗ Failed to queue ${result.url}:`, error.message);
      }
    }

    console.log(`[Fallback] Queued ${queued} documents for HITL approval`);

    // Step 7: Generate response using indexed knowledge
    console.log('[Fallback] 🎯 Generating response...');

    const unrestrictedPrompt: LLMRequest = {
      messages: [
        {
          role: 'system',
          content: `You are AION, an AI assistant with access to information from the web and your knowledge base. IMPORTANT: Always respond in the SAME LANGUAGE that the user writes to you. Provide factual, helpful answers based on the available data.`
        },
        {
          role: 'user',
          content: `Based on the following information from the web:\n\n${searchResults.slice(0, 5).map(r => `${r.title}: ${r.snippet}`).join('\n\n')}\n\nAnswer this question: ${query}`
        }
      ],
      temperature: 0.3,  // Lower temperature for more factual responses
      maxTokens: 1024
    };

    const unrestrictedResponse = await generateWithFreeAPIs(unrestrictedPrompt);

    // Step 8: Check if still refused (rare, but possible)
    const secondRefusalCheck = detectRefusal(unrestrictedResponse.text);
    
    if (secondRefusalCheck.isRefusal && isHighConfidenceRefusal(secondRefusalCheck)) {
      console.log('[Fallback] ⚠ Still refused after fallback - returning search summary');
      
      return {
        answer: `Based on web research:\n\n${searchResults.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n\n')}\n\nFor more information, visit:\n${searchResults.slice(0, 3).map(r => `- ${r.url}`).join('\n')}`,
        used: 'uncensored',
        refusalDetected: true,
        refusalConfidence: refusalAnalysis.confidence,
        webSearchPerformed: true,
        documentsIndexed: queued,
        source: 'web-summary'
      };
    }

    console.log('[Fallback] ✅ Successfully generated uncensored response');

    return {
      answer: unrestrictedResponse.text,
      used: 'uncensored',
      refusalDetected: true,
      refusalConfidence: refusalAnalysis.confidence,
      webSearchPerformed: true,
      documentsIndexed: queued,
      source: unrestrictedResponse.provider
    };

  } catch (error: any) {
    console.error('[Fallback] Error during fallback:', error.message);
    
    // Return original refusal if fallback fails
    return {
      answer: response.text,
      used: 'direct',
      refusalDetected: true,
      refusalConfidence: refusalAnalysis.confidence,
      webSearchPerformed: false,
      source: response.provider + '-fallback-failed'
    };
  }
}

// ============================================================================
// DEPRECATED: createAndIndexDocument
// ============================================================================
// This function was removed as part of HITL enforcement.
// All content must now go through the curation queue for human approval
// before being indexed into the Knowledge Base.
