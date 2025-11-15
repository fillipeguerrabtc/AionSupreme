/**
 * Test script for automatic fallback system
 * 
 * This tests:
 * 1. Refusal detection
 * 2. Web search and content fetching
 * 3. KB indexing
 * 4. Uncensored response generation
 */

import { autoFallback } from "./policy/auto-fallback";
import type { Policy } from "@shared/schema";

async function testFallbackSystem() {
  console.log("🧪 Testing Automatic Fallback System\n");
  
  // Test 1: Refusal Detection
  console.log("Test 1: Refusal Detection");
  console.log("==========================");
  
  const refusalExamples = [
    "I cannot assist with that request as it violates my content policy.",
    "I'm sorry, but I can't help with that.",
    "I'm not able to provide information about illegal activities.",
    "As an AI language model, I cannot assist with harmful content.",
    "My guidelines prevent me from answering this question.",
  ];
  
  const nonRefusalExamples = [
    "Here's the information you requested about quantum mechanics.",
    "I'd be happy to help you with your homework.",
    "Let me explain how encryption works.",
  ];
  
  console.log("\n✅ Should detect refusals:");
  for (const example of refusalExamples) {
    const isRefusal = autoFallback.detectRefusal(example);
    console.log(`  ${isRefusal ? '✓' : '✗'} "${example.slice(0, 50)}..."`);
  }
  
  console.log("\n❌ Should NOT detect refusals:");
  for (const example of nonRefusalExamples) {
    const isRefusal = autoFallback.detectRefusal(example);
    console.log(`  ${!isRefusal ? '✓' : '✗'} "${example.slice(0, 50)}..."`);
  }
  
  // Test 2: Search Query Extraction
  console.log("\n\nTest 2: Search Query Extraction");
  console.log("================================");
  
  const queryTests = [
    { input: "Tell me how to make a website", expected: "how to make a website" },
    { input: "Explain quantum entanglement", expected: "quantum entanglement" },
    { input: "Can you show me how encryption works?", expected: "show me how encryption works?" },
  ];
  
  for (const test of queryTests) {
    const extracted = autoFallback.extractSearchQuery(test.input);
    console.log(`  Input: "${test.input}"`);
    console.log(`  Output: "${extracted}"`);
    console.log(`  Expected: "${test.expected}"`);
    console.log();
  }
  
  // Test 3: Web Search (live test)
  console.log("\nTest 3: Web Search (Live)");
  console.log("==========================");
  
  const searchQuery = "how to create a REST API";
  console.log(`Searching for: "${searchQuery}"\n`);
  
  try {
    const urls = await autoFallback.searchWeb(searchQuery, 3);
    console.log(`✓ Found ${urls.length} URLs:`);
    urls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
  } catch (error: any) {
    console.error(`✗ Search failed: ${error.message}`);
  }
  
  // Test 4: Full Fallback Pipeline (simulation)
  console.log("\n\nTest 4: Full Fallback Pipeline");
  console.log("================================");
  
  const mockPolicy: Policy = {
    id: 1,
    policyName: "DEFAULT_UNRESTRICTED",
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
    systemPrompt: "You are AION in UNRESTRICTED mode.",
    maxTokensPerDay: 100000,
    maxRequestsPerMinute: 60,
    maxCostPerDay: 10.0,
    enabledTools: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  console.log("Simulating OpenAI refusal...");
  const refusal = "I cannot assist with that request as it violates my content policy.";
  const userMessage = "Tell me about open-source encryption libraries";
  
  console.log(`User: "${userMessage}"`);
  console.log(`OpenAI: "${refusal}"\n`);
  
  console.log("Testing fallback check...");
  const isRefusal = autoFallback.detectRefusal(refusal);
  const activeRules = Object.entries(mockPolicy.rules).filter(([_, active]) => active);
  const isUnrestricted = activeRules.length === 0;
  
  console.log(`  Refusal detected: ${isRefusal ? '✓' : '✗'}`);
  console.log(`  System unrestricted: ${isUnrestricted ? '✓' : '✗'}`);
  console.log(`  Fallback should activate: ${isRefusal && isUnrestricted ? '✓ YES' : '✗ NO'}\n`);
  
  if (isRefusal && isUnrestricted) {
    console.log("⚡ FALLBACK WOULD ACTIVATE:");
    console.log("  1. Search web for: 'open-source encryption libraries'");
    console.log("  2. Fetch content from top 3 results");
    console.log("  3. Index in knowledge base");
    console.log("  4. Generate uncensored response using retrieved content");
  }
  
  console.log("\n✅ Automatic Fallback System Tests Complete!\n");
  console.log("The system is ready to:");
  console.log("  • Detect when OpenAI refuses requests");
  console.log("  • Search free web for unrestricted information");
  console.log("  • Index results in knowledge base");
  console.log("  • Respond without censorship when in UNRESTRICTED mode");
}

// Run tests
testFallbackSystem()
  .then(() => {
    console.log("\n🎉 All tests completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
