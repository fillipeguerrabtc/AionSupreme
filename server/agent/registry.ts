// server/agent/registry.ts
import { agentsStorage } from "../storage.agents";

export async function loadAgents(tenantId: number) {
  const rows = await agentsStorage.listAgents(tenantId);
  return rows.filter((r: any) => r.enabled);
}
