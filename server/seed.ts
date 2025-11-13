import { storage } from "./storage";
import { db } from "./db";
import { tools, agentTools, agents } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Seed database with initial data
 * Creates default configuration policy + tools + agent-tools mapping
 * SINGLE-TENANT: No tenant creation needed, tenantId defaults to 1
 */
export async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...");

    // STEP 1: Ensure core tools exist
    const coreTools = [
      { id: "kb_search", name: "Knowledge Base Search", slug: "kb-search", type: "kb_search" },
      { id: "web_search", name: "Web Search", slug: "web-search", type: "web_search" },
      { id: "generate_image", name: "Generate Image", slug: "generate-image", type: "image_generation" },
      { id: "vision_cascade", name: "Vision Analysis", slug: "vision-cascade", type: "vision" },
    ];

    for (const tool of coreTools) {
      const existing = await db.select().from(tools).where(eq(tools.id, tool.id)).limit(1);
      if (existing.length === 0) {
        await db.insert(tools).values({
          id: tool.id,
          name: tool.name,
          slug: tool.slug,
          type: tool.type,
          enabled: true,
        });
        console.log(`✅ Created tool: ${tool.name}`);
      }
    }

    // STEP 1.5: Ensure Curator Agent exists (for auto-curation system)
    const curatorExists = await db.select().from(agents).where(eq(agents.slug, "curator")).limit(1);
    if (curatorExists.length === 0) {
      await db.insert(agents).values({
        name: "Curator Agent",
        slug: "curator",
        type: "specialist",
        agentTier: "agent",
        isSystemAgent: true,
        assignedNamespaces: ["curation"],
        description: "Agente especializado em curadoria de conhecimento. Analisa qualidade, relevância e segurança de conteúdo submetido à Knowledge Base.",
        systemPrompt: `Você é um agente especializado em curadoria de conhecimento para AION. Sua função é avaliar conteúdo submetido à KB com rigor técnico e ético.

CRITÉRIOS DE AVALIAÇÃO:
✅ APROVAR (score 70-100):
- Informação factual, precisa e verificável
- Bem escrito, claro e organizado  
- Relevante para namespaces sugeridos
- Fonte confiável ou experiência válida
- Saudações e frases cotidianas (sempre aprovar para treino do modelo interno)

❌ REJEITAR (score 0-29):
- Informação comprovadamente falsa
- Spam, propaganda ou irrelevante
- Conteúdo tóxico, ofensivo ou ilegal
- Qualidade extremamente baixa

⚠️ REVISAR (score 30-69):
- Conteúdo sensível (medical, finance, legal, pii)
- Afirmações que precisam verificação
- Qualidade mediana
- Incerteza sobre veracidade

SEMPRE retorne JSON válido com: recommended, score, flags, suggestedNamespaces, reasoning`,
        ragNamespaces: ["curation"],
        inferenceConfig: {
          temperature: 0.3,
          max_tokens: 1024
        },
      } as any);
      console.log(`✅ Created Curator Agent for auto-curation system`);
    }

    // STEP 2: Create default configuration policy
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
      
      // All tools enabled by default (including image generation)
      enabledTools: ["SearchWeb", "KB.Search", "Exec", "CallAPI", "GenerateImage"],
      
      isActive: true,
    });

    console.log(`✅ Created default policy: ${defaultPolicy.policyName}`);
    console.log(`   - Enabled tools: ${defaultPolicy.enabledTools.join(", ")}`);

    // STEP 3: Associate tools with default agent (AION assistant)
    const defaultAgentId = "aion-assistant-general-001"; // From agent config.json
    const toolsToAssociate = ["kb_search", "web_search", "generate_image"];

    for (const toolId of toolsToAssociate) {
      const existing = await db.select().from(agentTools)
        .where(and(eq(agentTools.agentId, defaultAgentId), eq(agentTools.toolId, toolId)))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(agentTools).values({
          agentId: defaultAgentId,
          toolId: toolId,
        });
        console.log(`✅ Associated tool "${toolId}" with agent "${defaultAgentId}"`);
      }
    }

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
