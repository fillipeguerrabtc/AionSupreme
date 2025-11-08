import { db } from "../db";
import { namespaces, agents } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Orphan Detection Service
 * 
 * Scans the system for "zombie" data - entities referencing
 * non-existent or deleted parent records.
 * 
 * Critical for data integrity and lifecycle management.
 */

export interface AgentWithInvalidNamespaces {
  id: string;
  slug: string;
  name: string;
  agentTier: string | null;
  assignedNamespaces: string[] | null;
  invalidNamespaces: string[];
  validNamespaces: string[];
  canAutoFix: boolean; // true if has valid namespaces, false if all invalid
}

export interface OrphanDetectionResult {
  agentsWithIssues: AgentWithInvalidNamespaces[];
  canAutoFix: number; // Agents with some valid namespaces (safe to auto-fix)
  needsReview: number; // Agents with ZERO valid namespaces (manual review required)
  totalIssues: number;
  validNamespaces: string[];
  scannedAgents: number;
}

/**
 * Detect agents with invalid assigned_namespaces
 * 
 * Strategy:
 * - Agents with SOME valid namespaces → FIX (remove invalid, keep valid)
 * - Agents with ZERO valid namespaces → DELETE
 * - Agents with null/empty namespaces → SKIP (may be legitimate unconfigured agents)
 * 
 * @returns Detection result with fix/delete actions
 */
export async function detectOrphanedAgents(): Promise<OrphanDetectionResult> {
  try {
    // Step 1: Get all valid namespace names from DB
    const allNamespaces = await db.select().from(namespaces);
    const validNamespaceSet = new Set(allNamespaces.map((ns) => ns.name));
    const validNamespaceArray = Array.from(validNamespaceSet);

    // Step 2: Get ALL agents (enabled + disabled)
    const allAgents = await db.select().from(agents);

    // Step 3: Identify agents with invalid namespaces
    const agentsWithIssues: AgentWithInvalidNamespaces[] = [];
    let canAutoFix = 0;
    let needsReview = 0;

    for (const agent of allAgents) {
      // SKIP agents with null/empty namespaces (may be legitimate)
      if (!agent.assignedNamespaces || agent.assignedNamespaces.length === 0) {
        continue;
      }

      // Separate valid and invalid namespaces
      const validNs = agent.assignedNamespaces.filter((ns) => validNamespaceSet.has(ns));
      const invalidNs = agent.assignedNamespaces.filter((ns) => !validNamespaceSet.has(ns));

      // Only report agents with at least one invalid namespace
      if (invalidNs.length > 0) {
        const canAutoFixThis = validNs.length > 0;
        
        agentsWithIssues.push({
          id: agent.id,
          slug: agent.slug,
          name: agent.name,
          agentTier: agent.agentTier,
          assignedNamespaces: agent.assignedNamespaces,
          invalidNamespaces: invalidNs,
          validNamespaces: validNs,
          canAutoFix: canAutoFixThis,
        });

        if (canAutoFixThis) {
          canAutoFix++;
        } else {
          needsReview++;
        }
      }
    }

    return {
      agentsWithIssues,
      canAutoFix,
      needsReview,
      totalIssues: agentsWithIssues.length,
      validNamespaces: validNamespaceArray,
      scannedAgents: allAgents.length,
    };
  } catch (error) {
    console.error('[OrphanDetection] Error in detectOrphanedAgents:', error);
    throw error;
  }
}

/**
 * Auto-fix agents with invalid namespaces (SAFE operation)
 * 
 * Strategy:
 * - Only fixes agents with SOME valid namespaces (canAutoFix=true)
 * - Removes invalid namespaces, keeps valid ones
 * - NEVER deletes agents automatically (manual review required)
 * 
 * Agents with ZERO valid namespaces are NOT touched - admin must review manually.
 * This prevents accidental deletion during namespace renames/migrations.
 * 
 * @returns Repair result with counts
 */
export async function autoFixOrphanedAgents(): Promise<{
  fixed: number;
  skipped: number;
  total: number;
}> {
  try {
    const { agentsWithIssues } = await detectOrphanedAgents();

    if (agentsWithIssues.length === 0) {
      return { fixed: 0, skipped: 0, total: 0 };
    }

    let fixed = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      for (const agent of agentsWithIssues) {
        if (agent.canAutoFix) {
          // FIX: Update assigned_namespaces to remove invalid ones
          await tx
            .update(agents)
            .set({
              assignedNamespaces: agent.validNamespaces,
              updatedAt: new Date(),
            })
            .where(eq(agents.id, agent.id));
          
          fixed++;
          console.log(`[Orphan Auto-Fix] ✓ Fixed ${agent.slug}: removed invalid ${agent.invalidNamespaces.join(", ")}, kept ${agent.validNamespaces.join(", ")}`);
        } else {
          // SKIP: Zero valid namespaces - requires manual review
          skipped++;
          console.log(`[Orphan Auto-Fix] ⚠️  Skipped ${agent.slug}: zero valid namespaces - manual review required`);
        }
      }
    });

    return {
      fixed,
      skipped,
      total: agentsWithIssues.length,
    };
  } catch (error) {
    console.error('[OrphanDetection] Error in autoFixOrphanedAgents:', error);
    throw error;
  }
}
