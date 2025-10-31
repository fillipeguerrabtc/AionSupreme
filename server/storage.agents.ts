// server/storage.agents.ts
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { agents, tools, agentTools, traces } from "../shared/schema";

export const agentsStorage = {
  async listAgents() {
    return db.select().from(agents);
  },
  async getAgent(id: string) {
    const rows = await db.select().from(agents).where(eq(agents.id, id));
    return rows[0] || null;
  },
  async createAgent(data: any) {
    const rows = await db.insert(agents).values(data).returning();
    return rows[0];
  },
  async updateAgent(id: string, data: any) {
    const rows = await db.update(agents).set({ ...data, updatedAt: new Date() }).where(eq(agents.id, id)).returning();
    return rows[0];
  },
  async deleteAgent(id: string) {
    // soft delete: enabled=false
    const rows = await db.update(agents).set({ enabled: false, updatedAt: new Date() }).where(eq(agents.id, id)).returning();
    return rows[0];
  },
  
  // Agent-Tools relationship management
  async getAgentTools(agentId: string) {
    const rows = await db
      .select({ 
        id: tools.id,
        name: tools.name, 
        type: tools.type, 
        config: tools.config 
      })
      .from(agentTools)
      .innerJoin(tools, eq(agentTools.toolId, tools.id))
      .where(eq(agentTools.agentId, agentId));
    return rows;
  },
  
  async assignTool(agentId: string, toolId: string) {
    await db.insert(agentTools).values({ agentId, toolId });
  },
  
  async removeTool(agentId: string, toolId: string) {
    await db.delete(agentTools).where(
      and(eq(agentTools.agentId, agentId), eq(agentTools.toolId, toolId))
    );
  },
};

export const toolsStorage = {
  async listTools() {
    return db.select().from(tools);
  }
};

export const tracesStorage = {
  async insertTrace(row: any) { return db.insert(traces).values(row); }
};
