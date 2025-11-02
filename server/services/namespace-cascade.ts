import { db } from "../db";
import { namespaces, agents, documents, embeddings } from "@shared/schema";
import { eq, like, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

/**
 * Cascade Delete Service for Namespaces
 * 
 * Deleting a namespace triggers:
 * 1. Delete all child namespaces (recursive)
 * 2. Delete all agents with assigned_namespaces matching
 * 3. Delete all subagents with assigned_namespaces matching
 * 
 * Prevents orphans/zombie data across the system.
 */

export interface CascadeDeleteResult {
  deletedNamespaces: string[];
  deletedAgents: string[];
  deletedDocuments: number;
  deletedEmbeddings: number;
  deletedFiles: number;
  totalDeleted: number;
}

/**
 * Recursively find all child namespaces
 * @param parentName Parent namespace name (e.g., "financas")
 * @returns Array of child namespace names (e.g., ["financas/investimentos", "financas/impostos"])
 */
async function findChildNamespaces(parentName: string): Promise<string[]> {
  const children = await db
    .select()
    .from(namespaces)
    .where(like(namespaces.name, `${parentName}/%`));

  return children.map((ns) => ns.name);
}

/**
 * Find all agents/subagents assigned to a namespace
 * @param namespaceName Namespace name to match against assigned_namespaces
 * @returns Array of agent IDs
 */
async function findAgentsByNamespace(namespaceName: string): Promise<string[]> {
  // Query ALL agents (enabled + disabled) to prevent orphans
  const matchingAgents = await db
    .select()
    .from(agents);

  // Filter in-memory (Drizzle doesn't support JSON array contains natively)
  const filtered = matchingAgents.filter((agent) => {
    if (!agent.assignedNamespaces) return false;
    return agent.assignedNamespaces.includes(namespaceName);
  });

  return filtered.map((a) => a.id);
}

/**
 * Cascade delete namespace and all related entities
 * @param namespaceName Namespace name to delete (e.g., "financas")
 * @returns Cascade delete result with counts
 */
export async function cascadeDeleteNamespace(namespaceName: string): Promise<CascadeDeleteResult> {
  const deletedNamespaces: string[] = [];
  const deletedAgents: string[] = [];
  let deletedDocuments = 0;
  let deletedEmbeddings = 0;
  let deletedFiles = 0;

  // CRITICAL: Wrap in transaction for atomicity
  await db.transaction(async (tx) => {
    // Step 1: Find all child namespaces (recursive)
    const children = await tx
      .select()
      .from(namespaces)
      .where(like(namespaces.name, `${namespaceName}/%`))
      .then((rows) => rows.map((ns) => ns.name));
    
    // Step 2: Collect all namespaces to delete (parent + children)
    const namespacesToDelete = [namespaceName, ...children];
    
    // Step 3: Delete KB documents and embeddings for all namespaces
    for (const ns of namespacesToDelete) {
      // Find documents in this namespace (documents use metadata.namespaces array)
      const allDocs = await tx.select().from(documents);
      const docsInNamespace = allDocs.filter(doc => {
        const metadata = doc.metadata as any;
        return metadata?.namespaces?.includes(ns);
      });
      
      if (docsInNamespace.length > 0) {
        const docIds = docsInNamespace.map(d => d.id);
        
        // Delete embeddings first (foreign key constraint)
        const deletedEmbeddingsResult = await tx
          .delete(embeddings)
          .where(inArray(embeddings.documentId, docIds));
        
        deletedEmbeddings += deletedEmbeddingsResult.rowCount || 0;
        
        // Delete physical files (documents use storageUrl field)
        for (const doc of docsInNamespace) {
          if (doc.storageUrl) {
            try {
              const fullPath = path.isAbsolute(doc.storageUrl) 
                ? doc.storageUrl 
                : path.join(process.cwd(), doc.storageUrl);
              
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                deletedFiles++;
              }
            } catch (error: any) {
              console.warn(`[Cascade] Could not delete file ${doc.storageUrl}:`, error.message);
            }
          }
        }
        
        // Delete documents
        await tx.delete(documents).where(inArray(documents.id, docIds));
        deletedDocuments += docsInNamespace.length;
      }
    }
    
    // Step 4: Handle agents/subagents with CASCADE DELETE logic
    // CONDITIONAL LOGIC (Task 13):
    // - If agent has ONLY this namespace → DELETE agent
    // - If agent has MULTIPLE namespaces → REMOVE namespace from list (UPDATE)
    for (const ns of namespacesToDelete) {
      const matchingAgents = await tx
        .select()
        .from(agents)
        .then((rows) =>
          rows.filter((a) => a.assignedNamespaces?.includes(ns))
        );
      
      for (const agent of matchingAgents) {
        const currentNamespaces = agent.assignedNamespaces || [];
        const remainingNamespaces = currentNamespaces.filter((n) => n !== ns);
        
        if (remainingNamespaces.length === 0) {
          // CASE A: Agent has ONLY this namespace → DELETE agent completely
          await tx.delete(agents).where(eq(agents.id, agent.id));
          deletedAgents.push(agent.id);
        } else {
          // CASE B: Agent has MULTIPLE namespaces → REMOVE this namespace from list
          await tx
            .update(agents)
            .set({ assignedNamespaces: remainingNamespaces })
            .where(eq(agents.id, agent.id));
          // Note: Not tracking as "deleted" since agent still exists
        }
      }
    }

    // Step 5: Delete all child namespaces (batch)
    if (children.length > 0) {
      await tx.delete(namespaces).where(inArray(namespaces.name, children));
      deletedNamespaces.push(...children);
    }

    // Step 6: Delete the parent namespace itself
    await tx.delete(namespaces).where(eq(namespaces.name, namespaceName));
    deletedNamespaces.push(namespaceName);
  });

  console.log(`[Cascade] Deleted namespace "${namespaceName}": ${deletedNamespaces.length} namespaces, ${deletedAgents.length} agents, ${deletedDocuments} documents, ${deletedEmbeddings} embeddings, ${deletedFiles} files`);

  return {
    deletedNamespaces,
    deletedAgents,
    deletedDocuments,
    deletedEmbeddings,
    deletedFiles,
    totalDeleted: deletedNamespaces.length + deletedAgents.length + deletedDocuments,
  };
}
