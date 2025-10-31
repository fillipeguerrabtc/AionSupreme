// server/routes/agents.ts
import type { Express } from "express";
import { agentsStorage } from "../storage.agents";
import { publishEvent } from "../events";

export function registerAgentRoutes(app: Express) {
  app.get("/api/agents", async (req, res) => {
    try {
      const rows = await agentsStorage.listAgents();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const created = await agentsStorage.createAgent(req.body);
      await publishEvent("AGENT_CREATED", { agentId: created.id });
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    try {
      const row = await agentsStorage.getAgent(req.params.id);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/agents/:id", async (req, res) => {
    try {
      const updated = await agentsStorage.updateAgent(req.params.id, req.body);
      await publishEvent("AGENT_UPDATED", { agentId: req.params.id, namespacesChanged: true, namespaces: updated?.ragNamespaces || [] });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const deleted = await agentsStorage.deleteAgent(req.params.id);
      await publishEvent("AGENT_DELETED", { agentId: req.params.id });
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
