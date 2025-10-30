// server/storage.agents.ts
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { agents, tools, agentTools, traces } from "../shared/schema";

export const agentsStorage = {
  async listAgents(tenantId: number) {
    return db.select().from(agents).where(eq(agents.tenantId, tenantId));
  },
  async getAgent(tenantId: number, id: string) {
    const rows = await db.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id)));
    return rows[0] || null;
  },
  async createAgent(tenantId: number, data: any) {
    const rows = await db.insert(agents).values({ ...data, tenantId }).returning();
    return rows[0];
  },
  async updateAgent(tenantId: number, id: string, data: any) {
    const rows = await db.update(agents).set({ ...data, updatedAt: new Date() }).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).returning();
    return rows[0];
  },
  async deleteAgent(tenantId: number, id: string) {
    // soft delete: enabled=false
    const rows = await db.update(agents).set({ enabled: false, updatedAt: new Date() }).where(and(eq(agents.tenantId, tenantId), eq(agents.id, id))).returning();
    return rows[0];
  },
};

export const toolsStorage = {
  async listTools(tenantId: number) {
    return db.select().from(tools).where(eq(tools.tenantId, tenantId));
  }
};

export const tracesStorage = {
  async insertTrace(row: any) { return db.insert(traces).values(row); }
};
