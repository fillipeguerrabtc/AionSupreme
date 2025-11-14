import { db } from "../db";
import { namespaces, agents, documents, embeddings } from "@shared/schema";
import { eq, like, inArray, sql } from "drizzle-orm";
import { promises as fs } from "fs";
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
  try {
    const children = await db
      .select()
      .from(namespaces)
      .where(like(namespaces.name, `${parentName}/%`));

    return children.map((ns) => ns.name);
  } catch (error) {
    console.error(`[NamespaceCascade] Error finding child namespaces for "${parentName}":`, error);
    throw error;
  }
}

/**
 * Find all agents/subagents assigned to a namespace
 * 🔥 2025 FIX: Use PostgreSQL JSON containment query instead of full-table scan
 * @param namespaceName Namespace name to match against assigned_namespaces
 * @returns Array of agent IDs
 */
async function findAgentsByNamespace(namespaceName: string): Promise<string[]> {
  try {
    // 🔥 PERFORMANCE FIX: Server-side JSON containment filter (PostgreSQL @> operator)
    // No more loading ALL agents into memory!
    const matchingAgents = await db
      .select({ id: agents.id })
      .from(agents)
      .where(sql`${agents.assignedNamespaces} @> ARRAY[${namespaceName}]::text[]`);

    return matchingAgents.map((a) => a.id);
  } catch (error) {
    console.error(`[NamespaceCascade] Error finding agents for namespace "${namespaceName}":`, error);
    throw error;
  }
}

/**
 * Cascade delete namespace and all related entities
 * @param namespaceName Namespace name to delete (e.g., "financas")
 * @returns Cascade delete result with counts
 */
export async function cascadeDeleteNamespace(namespaceName: string): Promise<CascadeDeleteResult> {
  try {
    const deletedNamespaces: string[] = [];
    const deletedAgents: string[] = [];
    let deletedDocuments = 0;
    let deletedEmbeddings = 0;
    let deletedFiles = 0;

    // Step 1: Collect file paths BEFORE transaction
    console.log(`[NamespaceCascade] Starting cascade delete for namespace: "${namespaceName}"`);
    
    const filePaths: string[] = [];
    
    // Find all child namespaces (recursive)
    const children = await db
      .select()
      .from(namespaces)
      .where(like(namespaces.name, `${namespaceName}/%`))
      .then((rows) => rows.map((ns) => ns.name));
    
    const namespacesToDelete = [namespaceName, ...children];
    console.log(`[NamespaceCascade] Found ${namespacesToDelete.length} namespaces to delete (including children)`);
    
    // Collect all file paths from documents in these namespaces
    for (const ns of namespacesToDelete) {
      const allDocs = await db.select().from(documents);
      const docsInNamespace = allDocs.filter(doc => {
        const metadata = doc.metadata as any;
        return metadata?.namespaces?.includes(ns);
      });
      
      for (const doc of docsInNamespace) {
        if (doc.storageUrl) {
          const fullPath = path.isAbsolute(doc.storageUrl) 
            ? doc.storageUrl 
            : path.join(process.cwd(), doc.storageUrl);
          filePaths.push(fullPath);
        }
      }
    }
    
    console.log(`[NamespaceCascade] Collected ${filePaths.length} file paths for deletion`);

    // Step 2: Delete DB records in transaction (NO file operations)
    await db.transaction(async (tx) => {
      // Delete KB documents and embeddings for all namespaces
      for (const ns of namespacesToDelete) {
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
          
          // Delete documents (NO file operations here!)
          await tx.delete(documents).where(inArray(documents.id, docIds));
          deletedDocuments += docsInNamespace.length;
        }
      }
      
      // Handle agents/subagents with CASCADE DELETE logic
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
          }
        }
      }

      // Delete all child namespaces (batch)
      if (children.length > 0) {
        await tx.delete(namespaces).where(inArray(namespaces.name, children));
        deletedNamespaces.push(...children);
      }

      // Delete the parent namespace itself
      await tx.delete(namespaces).where(eq(namespaces.name, namespaceName));
      deletedNamespaces.push(namespaceName);
    });

    console.log(`[NamespaceCascade] Transaction completed successfully`);

    // Step 3: Delete files AFTER transaction (with error handling)
    const deletions = filePaths.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
        return { success: true, path: filePath };
      } catch (err: any) {
        console.error(`[NamespaceCascade] Failed to delete file: ${filePath}`, err.message);
        // Don't throw - we already deleted DB record
        return { success: false, path: filePath, error: err.message };
      }
    });
    
    const results = await Promise.allSettled(deletions);
    
    // Count successful file deletions
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        deletedFiles++;
      }
    });

    console.log(`[NamespaceCascade] Deleted namespace "${namespaceName}": ${deletedNamespaces.length} namespaces, ${deletedAgents.length} agents, ${deletedDocuments} documents, ${deletedEmbeddings} embeddings, ${deletedFiles}/${filePaths.length} files`);

    return {
      deletedNamespaces,
      deletedAgents,
      deletedDocuments,
      deletedEmbeddings,
      deletedFiles,
      totalDeleted: deletedNamespaces.length + deletedAgents.length + deletedDocuments,
    };
  } catch (error) {
    console.error(`[NamespaceCascade] Error deleting namespace "${namespaceName}":`, error);
    throw error;
  }
}
