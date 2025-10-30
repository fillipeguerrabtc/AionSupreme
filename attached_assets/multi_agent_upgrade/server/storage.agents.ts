// server/storage.agents.ts
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { agents, tools, agentTools, traces } from "../shared/schema_agents";

export const agentsStorage = {
  async listAgents(tenantId: string) {
    return db.select().from(agents).where(eq(agents.tenantId, tenantId));
  },
  async getAgent(tenantId: string, id: string) {
    const rows = await db.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id)));
    return rows[0] || null;
  },
  async createAgent(tenantId: string, data: any) {
    const rows = await db.insert(agents).values({ ...data, tenantId }).returning();
    return rows[0];
  },
  async updateAgent(tenantId: string, id: string, data: any) {
    const rows = await db.update(agents).set({ ...data }).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).returning();
    return rows[0];
  },
  async deleteAgent(tenantId: string, id: string) {
    // soft delete: enabled=false
    const rows = await db.update(agents).set({ enabled: false }).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).returning();
    return rows[0];
  },
};

export const toolsStorage = {
  async listTools(tenantId: string) {
    return db.select().from(tools).where(eq(tools.tenantId, tenantId));
  }
};

export const tracesStorage = {
  async insertTrace(row: any) { return db.insert(traces).values(row); }
};
