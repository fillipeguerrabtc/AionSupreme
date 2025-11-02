import { storage } from "./storage";

/**
 * Seed database with initial data
 * Creates default configuration policy
 * SINGLE-TENANT: No tenant creation needed, tenantId defaults to 1
 */
export async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...");

    // Create default configuration policy
    const defaultPolicy = await storage.createPolicy({
      policyName: "Default Policy",
      
      // Default rules configuration
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
      
      // Neutral personality
      humor: "neutral",
      tone: "professional",
      behavior: {
        verbosity: 0.7,
        formality: 0.5,
        creativity: 0.8,
        precision: 0.9,
        persuasiveness: 0.5,
        empathy: 0.7,
        enthusiasm: 0.6,
      },
      
      // LLM parameters (balanced for production)
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      
      // System prompt - AION identity
      systemPrompt: `You are AION - an advanced autonomous AI assistant with access to comprehensive knowledge base, multimodal processing, and web search capabilities.

Provide helpful, direct, and complete responses to user questions. Your behavior and personality can be adjusted through the configuration settings.`,
      
      // Generous rate limits
      maxTokensPerDay: 1000000,
      maxRequestsPerMinute: 100,
      maxCostPerDay: 100.0,
      
      // All tools enabled by default
      enabledTools: ["SearchWeb", "KB.Search", "Exec", "CallAPI"],
      
      isActive: true,
    });

    console.log(`✅ Created default policy: ${defaultPolicy.policyName}`);
    console.log(`   - Enabled tools: ${defaultPolicy.enabledTools.join(", ")}`);

    console.log("\n🎉 Database seeded successfully!");
    
    return { policy: defaultPolicy };
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

// Run seed if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
