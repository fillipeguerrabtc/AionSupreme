/**
 * AION Minimal System Seed
 * 
 * ✅ DATABASE É SINGLE SOURCE OF TRUTH
 * ✅ ZERO HARDCODE DE NAMESPACES/AGENTS
 * ✅ NÍVEL PRODUÇÃO - CONFIGURÁVEL VIA UI ADMIN
 * 
 * Populates apenas:
 * - Tools (funcionalidades essenciais do sistema)
 * 
 * Usuário cria via UI Admin:
 * - Namespaces (Admin → Namespaces)
 * - Agents (Admin → Agents)
 * - SubAgents (Admin → Agents)
 * - Associações Agent-Tool (Admin → Agents → Edit)
 */

import { db } from "../db";
import { tools } from "@shared/schema";
import { sql } from "drizzle-orm";

interface ToolData {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: any;
}

// ============================================================================
// TOOLS: Funcionalidades essenciais do sistema
// ============================================================================

const TOOLS_SEED_DATA: ToolData[] = [
  {
    id: "kb_search",
    name: "Knowledge Base Search",
    slug: "kb-search",
    type: "kb_search",
    config: {
      description: "Search the internal knowledge base using semantic search (RAG)",
      parameters: {
        query: { type: "string", required: true, description: "Search query" },
        k: { type: "number", required: false, description: "Number of results (default: 5)" },
      },
    },
  },
  {
    id: "web_search",
    name: "Web Search",
    slug: "web-search",
    type: "web_search",
    config: {
      description: "Search the web using DuckDuckGo",
      parameters: {
        query: { type: "string", required: true, description: "Search query" },
        maxResults: { type: "number", required: false, description: "Max results (default: 5)" },
      },
    },
  },
  {
    id: "deepweb_search",
    name: "DeepWeb Search",
    slug: "deepweb-search",
    type: "deepweb_search",
    config: {
      description: "Search deep web and Tor network",
      parameters: {
        query: { type: "string", required: true, description: "Search query" },
      },
    },
  },
  {
    id: "vision_cascade",
    name: "Vision Analysis",
    slug: "vision-cascade",
    type: "vision",
    config: {
      description: "Analyze images using Vision AI cascade (Gemini → GPT-4V → Claude → HF)",
      parameters: {
        imageUrl: { type: "string", required: true, description: "Image URL or path" },
        prompt: { type: "string", required: false, description: "Analysis prompt" },
      },
    },
  },
  {
    id: "calculator",
    name: "Calculator",
    slug: "calculator",
    type: "calculator",
    config: {
      description: "Perform mathematical calculations",
      parameters: {
        expression: { type: "string", required: true, description: "Math expression to evaluate" },
      },
    },
  },
  {
    id: "crawler",
    name: "Web Crawler",
    slug: "web-crawler",
    type: "crawler",
    config: {
      description: "Crawl websites and extract content",
      parameters: {
        url: { type: "string", required: true, description: "URL to crawl" },
        depth: { type: "number", required: false, description: "Crawl depth (default: 2)" },
      },
    },
  },
  {
    id: "youtube_transcript",
    name: "YouTube Transcript",
    slug: "youtube-transcript",
    type: "youtube",
    config: {
      description: "Extract transcripts from YouTube videos",
      parameters: {
        videoUrl: { type: "string", required: true, description: "YouTube video URL" },
      },
    },
  },
];

// ============================================================================
// SEED EXECUTION
// ============================================================================

export async function seedCompleteSystem() {
  console.log("\n🌱 Seeding AION System (Tools only)...\n");

  try {
    // SEED TOOLS (essenciais para funcionalidade)
    console.log("🔧 Seeding Tools...");
    for (const tool of TOOLS_SEED_DATA) {
      await db
        .insert(tools)
        .values({
          id: tool.id,
          name: tool.name,
          slug: tool.slug,
          type: tool.type,
          config: tool.config,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: tools.id,
          set: {
            name: tool.name,
            slug: tool.slug,
            type: tool.type,
            config: tool.config,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        });
    }
    console.log(`   ✅ ${TOOLS_SEED_DATA.length} tools seeded\n`);

    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ SEED COMPLETO - SISTEMA PRONTO                            ║");
    console.log("╠════════════════════════════════════════════════════════════════╣");
    console.log("║  📝 PRÓXIMOS PASSOS (via UI Admin):                           ║");
    console.log("║                                                                ║");
    console.log("║  1. Criar Namespace root (ex: 'financas')                     ║");
    console.log("║  2. Criar Agent com esse namespace                            ║");
    console.log("║  3. Criar Subnamespaces (ex: 'financas/impostos')             ║");
    console.log("║  4. Criar SubAgent com subnamespaces                          ║");
    console.log("║  5. Associar tools aos agents via Edit Agent                  ║");
    console.log("║                                                                ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");
    
    return {
      success: true,
      tools: TOOLS_SEED_DATA.length,
    };
  } catch (error: any) {
    console.error("❌ Seed failed:", error.message);
    throw error;
  }
}
