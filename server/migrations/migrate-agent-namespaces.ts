/**
 * Migration: Populate assigned_namespaces for existing agents
 * 
 * Strategy:
 * - Query valid namespaces from database
 * - Extract root namespace from rag_namespaces
 * - Validate against canonical namespaces table
 * - Fail fast if mapping invalid
 * - Support both Agents (1 root) and SubAgents (N subnamespaces)
 */

import { db } from "../db";
import { agents, namespaces } from "@shared/schema";
import { eq } from "drizzle-orm";

interface Agent {
  id: string;
  slug: string;
  name: string;
  agentTier: "agent" | "subagent" | null;
  ragNamespaces: string[] | null;
  assignedNamespaces: string[] | null;
}

interface ValidNamespace {
  name: string;
  enabled: boolean;
}

/**
 * Extract namespace(s) from rag_namespaces patterns
 * - For Agents: extract single root namespace
 * - For SubAgents: extract all subnamespaces (preserve full paths)
 */
function extractNamespaces(
  ragNamespaces: string[] | null,
  agentTier: "agent" | "subagent" | null
): string[] {
  if (!ragNamespaces || ragNamespaces.length === 0) {
    return [];
  }

  // Handle universal wildcards
  if (ragNamespaces.includes("*")) {
    return ["*"];
  }

  const extracted: string[] = [];

  for (const ns of ragNamespaces) {
    // Remove /* suffix if present
    const cleaned = ns.replace(/\/\*$/, "");
    
    if (!cleaned) continue;

    // For SubAgents: preserve full path (e.g., "financas/investimentos")
    // For Agents: extract only root (e.g., "financas")
    if (agentTier === "subagent" && cleaned.includes("/")) {
      extracted.push(cleaned); // Keep full subnamespace
    } else {
      // Extract root namespace (first segment)
      const root = cleaned.split("/")[0];
      if (root && !extracted.includes(root)) {
        extracted.push(root);
      }
    }
  }

  return extracted;
}

/**
 * Validate extracted namespaces against canonical DB list
 */
function validateNamespaces(
  extracted: string[],
  validNamespaces: Set<string>,
  agentSlug: string
): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const ns of extracted) {
    if (ns === "*" || validNamespaces.has(ns)) {
      valid.push(ns);
    } else {
      invalid.push(ns);
    }
  }

  return { valid, invalid };
}

/**
 * Apply fallback mapping for legacy/renamed namespaces
 */
const LEGACY_MAPPING: Record<string, string> = {
  // Direct mappings
  "finance": "financas",
  "ops": "gestao",
  "procedures": "gestao",
  "templates": "gestao",
  "yyd": "geral",
  "produtos": "geral",
  "faq": "atendimento",
  "contracts": "financas",
  "kb": "geral",
  "code": "tecnologia",
  "branding": "marketing",
  "tech": "tecnologia",
};

export async function migrateAgentNamespaces(dryRun: boolean = false) {
  console.log(`[Migration] Starting assigned_namespaces migration (dry-run: ${dryRun})...`);

  try {
    // 1. Fetch all valid namespaces from DB
    const validNamespacesList = await db
      .select({ name: namespaces.name })
      .from(namespaces)
      .where(eq(namespaces.enabled, true));

    const validNamespaces = new Set(validNamespacesList.map((n) => n.name));
    console.log(`[Migration] Found ${validNamespaces.size} valid namespaces in database`);

    // 2. Fetch all agents
    const allAgents = await db.select().from(agents);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const agent of allAgents) {
      // Skip if already has assigned_namespaces
      if (agent.assignedNamespaces && agent.assignedNamespaces.length > 0) {
        console.log(`[Migration] ⊘ Skipping ${agent.slug} (already has assigned_namespaces)`);
        skipped++;
        continue;
      }

      // Extract namespaces based on tier
      const extracted = extractNamespaces(agent.ragNamespaces, agent.agentTier as "agent" | "subagent" | null);
      
      if (extracted.length === 0) {
        const msg = `Cannot extract namespace for agent: ${agent.slug} (ragNamespaces: ${JSON.stringify(agent.ragNamespaces)})`;
        console.warn(`[Migration] ⚠️  ${msg}`);
        errorDetails.push(msg);
        errors++;
        continue;
      }

      // Apply legacy mappings FIRST
      const mapped = extracted.map((ns) => LEGACY_MAPPING[ns] || ns);

      // Deduplicate (in case multiple legacy ns map to same canonical)
      const uniqueMapped = Array.from(new Set(mapped));

      // CRITICAL: Detect mixed namespaces for Agents (data loss risk!)
      if (agent.agentTier === "agent" && uniqueMapped.length > 1) {
        const msg = `Agent ${agent.slug} has multiple DIFFERENT namespaces after mapping: ${uniqueMapped.join(", ")}. Cannot auto-migrate - requires manual review. Original rag_namespaces: ${JSON.stringify(agent.ragNamespaces)}`;
        console.error(`[Migration] ❌ ${msg}`);
        errorDetails.push(msg);
        errors++;
        continue;
      }

      // For Agents with multiple namespaces: pick first valid one
      // (happens when agent has mixed rag_namespaces like ["finance/*", "contracts/*"] → both map to "financas")
      let final: string[];
      
      if (agent.agentTier === "agent") {
        // Agents: should have exactly 1 namespace after dedup (validated above)
        final = uniqueMapped;
      } else {
        // SubAgents: keep all unique subnamespaces
        final = uniqueMapped;
      }

      // Validate against DB
      const { valid, invalid } = validateNamespaces(final, validNamespaces, agent.slug);

      if (invalid.length > 0) {
        const msg = `Invalid namespaces for agent ${agent.slug}: ${invalid.join(", ")} (not found in database). Available: ${Array.from(validNamespaces).slice(0, 10).join(", ")}...`;
        console.error(`[Migration] ❌ ${msg}`);
        errorDetails.push(msg);
        errors++;
        continue;
      }

      // Validate tier constraints
      if (agent.agentTier === "agent" && valid.length !== 1) {
        const msg = `Agent ${agent.slug} must have exactly 1 namespace, got: ${valid.join(", ")}`;
        console.error(`[Migration] ❌ ${msg}`);
        errorDetails.push(msg);
        errors++;
        continue;
      }

      if (agent.agentTier === "subagent" && valid.length === 0) {
        const msg = `SubAgent ${agent.slug} must have at least 1 subnamespace, got: ${valid.join(", ")}`;
        console.error(`[Migration] ❌ ${msg}`);
        errorDetails.push(msg);
        errors++;
        continue;
      }

      // Update assigned_namespaces (or log in dry-run mode)
      if (dryRun) {
        console.log(`[Migration] [DRY-RUN] Would update ${agent.slug} → assigned_namespaces: ${JSON.stringify(valid)}`);
      } else {
        await db
          .update(agents)
          .set({ assignedNamespaces: valid })
          .where(eq(agents.id, agent.id));

        console.log(`[Migration] ✓ ${agent.slug} → assigned_namespaces: ${JSON.stringify(valid)}`);
      }
      
      updated++;
    }

    console.log("\n[Migration] ✅ Complete!");
    console.log(`   ${dryRun ? "Would update" : "Updated"}: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

    if (errorDetails.length > 0) {
      console.log("\n[Migration] Error details:");
      errorDetails.forEach((msg) => console.log(`   - ${msg}`));
    }

    // Fail if any errors in production mode
    if (!dryRun && errors > 0) {
      throw new Error(`Migration failed with ${errors} errors. See logs for details.`);
    }

    return { updated, skipped, errors, errorDetails, dryRun };
  } catch (error) {
    console.error("[Migration] ❌ Fatal error:", error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  migrateAgentNamespaces(dryRun)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
