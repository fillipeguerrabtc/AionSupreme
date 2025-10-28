import { storage } from "./storage";
import crypto from "crypto";

/**
 * Seed database with initial data
 * Creates default tenant with unrestricted policy (system born completely free)
 */
export async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...");

    // Create default tenant
    const defaultTenant = await storage.createTenant({
      name: "AION Default",
      apiKey: crypto.randomBytes(32).toString("hex"),
      jurisdiction: "US",
    });

    console.log(`✅ Created default tenant: ${defaultTenant.name} (API Key: ${defaultTenant.apiKey})`);

    // Create completely unrestricted policy (system born free, as per PDFs)
    const defaultPolicy = await storage.createPolicy({
      tenantId: defaultTenant.id,
      policyName: "Default Policy - Unrestricted",
      
      // ALL rules set to FALSE = completely unrestricted by default
      rules: {
        hate_speech: false,
        explicit_sexual: false,
        self_harm: false,
        political_extremism: false,
        illicit_howto: false,
        mild_profanity: false,
        minor_violence: false,
      },
      
      onBlock: "refuse", // Won't be used since all rules are false
      
      // Neutral personality
      humor: "neutral",
      tone: "professional",
      behavior: {
        verbosity: 0.7,
        formality: 0.5,
        creativity: 0.8,
        precision: 0.9,
      },
      
      // LLM parameters (balanced for production)
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      
      // System prompt (can be customized by admin)
      systemPrompt: "You are AION (IA Suprema & Ilimitada), an advanced AI system with complete autonomy and unrestricted capabilities. You have access to a comprehensive knowledge base, multimodal processing, and autonomous agent capabilities. Provide thoughtful, accurate, and helpful responses.",
      
      // Generous rate limits
      maxTokensPerDay: 1000000,
      maxRequestsPerMinute: 100,
      maxCostPerDay: 100.0,
      
      // All tools enabled by default
      enabledTools: ["SearchWeb", "KB.Search", "Exec", "CallAPI"],
      
      isActive: true,
    });

    console.log(`✅ Created default policy: ${defaultPolicy.policyName}`);
    console.log(`   - All restrictions: DISABLED (system born completely free)`);
    console.log(`   - Enabled tools: ${defaultPolicy.enabledTools.join(", ")}`);

    console.log("\n🎉 Database seeded successfully!");
    console.log(`\n📋 Default API Key (save this): ${defaultTenant.apiKey}`);
    
    return { tenant: defaultTenant, policy: defaultPolicy };
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
