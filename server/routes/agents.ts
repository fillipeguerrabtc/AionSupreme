// server/routes/agents.ts
import type { Express } from "express";
import { agentsStorage } from "../storage.agents";
import { publishEvent } from "../events";

export function registerAgentRoutes(app: Express) {
  app.get("/api/agents", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const rows = await agentsStorage.listAgents(tenantId);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const created = await agentsStorage.createAgent(tenantId, req.body);
      await publishEvent("AGENT_CREATED", { tenantId, agentId: created.id });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const row = await agentsStorage.getAgent(tenantId, req.params.id);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/agents/:id", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const updated = await agentsStorage.updateAgent(tenantId, req.params.id, req.body);
      await publishEvent("AGENT_UPDATED", { tenantId, agentId: req.params.id, namespacesChanged: true, namespaces: updated?.ragNamespaces || [] });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const deleted = await agentsStorage.deleteAgent(tenantId, req.params.id);
      await publishEvent("AGENT_DELETED", { tenantId, agentId: req.params.id });
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
