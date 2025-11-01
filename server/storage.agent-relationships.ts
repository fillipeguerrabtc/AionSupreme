// server/storage.agent-relationships.ts
import { db } from "./db";
import { agentRelationships, agents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { alias } from "drizzle-orm/pg-core";

export const agentRelationshipsStorage = {
  async listAll() {
    // Proper aliases for BOTH parent and child joins (distinct table instances)
    const parentAgents = alias(agents, "parent_agents");
    const childAgents = alias(agents, "child_agents");
    
    return db
      .select({
        relationship: agentRelationships,
        parentAgent: parentAgents,
        childAgent: childAgents,
      })
      .from(agentRelationships)
      .leftJoin(parentAgents, eq(agentRelationships.parentAgentId, parentAgents.id))
      .leftJoin(childAgents, eq(agentRelationships.childAgentId, childAgents.id)); // All relationships in DB are active
  },

  async getByParent(parentAgentId: string) {
    return db
      .select({
        relationship: agentRelationships,
        childAgent: agents,
      })
      .from(agentRelationships)
      .innerJoin(agents, eq(agentRelationships.childAgentId, agents.id))
      .where(eq(agentRelationships.parentAgentId, parentAgentId));
  },

  async getByChild(childAgentId: string) {
    return db
      .select({
        relationship: agentRelationships,
        parentAgent: agents,
      })
      .from(agentRelationships)
      .innerJoin(agents, eq(agentRelationships.parentAgentId, agents.id))
      .where(eq(agentRelationships.childAgentId, childAgentId));
  },

  async create(data: {
    parentAgentId: string;
    childAgentId: string;
    delegationMode?: string;
    budgetSharePercent?: number;
    maxDepth?: number;
    toolDelta?: any;
    namespaceSuffix?: string;
  }) {
    const relationship = {
      // id is serial (auto-increment), no need to provide
      tenantId: 1,
      parentAgentId: data.parentAgentId,
      childAgentId: data.childAgentId,
      delegationMode: data.delegationMode || "dynamic",
      budgetSharePercent: data.budgetSharePercent !== undefined 
        ? Math.max(0, Math.min(1, data.budgetSharePercent)) // Clamp to [0, 1]
        : 0.4,
      maxDepth: data.maxDepth || 3,
      toolDelta: data.toolDelta,
      namespaceSuffix: data.namespaceSuffix,
    };

    const rows = await db.insert(agentRelationships).values(relationship).returning();
    return rows[0];
  },

  async update(id: number, data: Partial<typeof agentRelationships.$inferInsert>) {
    // Normalize budget share if provided
    if (data.budgetSharePercent !== undefined) {
      data.budgetSharePercent = Math.max(0, Math.min(1, data.budgetSharePercent));
    }

    const rows = await db
      .update(agentRelationships)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentRelationships.id, id))
      .returning();
    return rows[0];
  },

  async delete(id: number) {
    // HARD DELETE (no soft delete - exists in DB = active)
    await db.delete(agentRelationships).where(eq(agentRelationships.id, id));
  },

  // Check if relationship would create cycle (parent cannot be child of its own children)
  async wouldCreateCycle(parentId: string, childId: string): Promise<boolean> {
    // BFS to check if childId has parentId in its descendant tree
    const visited = new Set<string>();
    const queue = [childId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (current === parentId) {
        return true; // Cycle detected
      }

      // Get children of current node
      const children = await db
        .select({ childAgentId: agentRelationships.childAgentId })
        .from(agentRelationships)
        .where(eq(agentRelationships.parentAgentId, current));

      children.forEach((c) => queue.push(c.childAgentId));
    }

    return false;
  },
};
