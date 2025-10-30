// server/routes/agents.ts
import type { Express } from "express";
import { agentsStorage } from "../storage.agents";
import { publishEvent } from "../events";

export function registerAgentRoutes(app: Express) {
  app.get("/api/agents", async (req, res) => {
    const tenantId = (req.headers["x-tenant-id"] as string) || "";
    const rows = await agentsStorage.listAgents(tenantId);
    res.json(rows);
  });

  app.post("/api/agents", async (req, res) => {
    const tenantId = (req.headers["x-tenant-id"] as string) || "";
    const created = await agentsStorage.createAgent(tenantId, req.body);
    await publishEvent("AGENT_CREATED", { tenantId, agentId: created.id });
    res.status(201).json(created);
  });

  app.get("/api/agents/:id", async (req, res) => {
    const tenantId = (req.headers["x-tenant-id"] as string) || "";
    const row = await agentsStorage.getAgent(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  });

  app.patch("/api/agents/:id", async (req, res) => {
    const tenantId = (req.headers["x-tenant-id"] as string) || "";
    const updated = await agentsStorage.updateAgent(tenantId, req.params.id, req.body);
    await publishEvent("AGENT_UPDATED", { tenantId, agentId: req.params.id, namespacesChanged: true, namespaces: updated?.ragNamespaces || [] });
    res.json(updated);
  });

  app.delete("/api/agents/:id", async (req, res) => {
    const tenantId = (req.headers["x-tenant-id"] as string) || "";
    const deleted = await agentsStorage.deleteAgent(tenantId, req.params.id);
    await publishEvent("AGENT_DELETED", { tenantId, agentId: req.params.id });
    res.json(deleted);
  });
}
