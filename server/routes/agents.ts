// server/routes/agents.ts
import type { Express } from "express";
import { agentsStorage } from "../storage.agents";
import { publishEvent } from "../events";
import { validateNamespaceAssignment } from "../agent/namespace-validators";

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
      // Validate namespace assignment based on agentTier
      const agentTier = req.body.agentTier || "agent";
      const assignedNamespaces = req.body.assignedNamespaces || [];
      
      const validation = validateNamespaceAssignment(agentTier, assignedNamespaces);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // ADDITIONAL VALIDATION: For SubAgents, verify parent Agent exists
      if (agentTier === "subagent" && validation.rootNamespace) {
        const allAgents = await agentsStorage.listAgents();
        const parentAgents = allAgents.filter(
          (agent) => agent.agentTier === "agent" && agent.assignedNamespaces?.includes(validation.rootNamespace!)
        );

        if (parentAgents.length === 0) {
          return res.status(400).json({
            error: `Não existe Agent pai para o namespace "${validation.rootNamespace}". Crie primeiro um Agent com namespace "${validation.rootNamespace}" antes de criar SubAgents.`
          });
        }
      }

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
      // Validate namespace assignment if being updated
      if (req.body.agentTier || req.body.assignedNamespaces) {
        // Get existing agent to merge with updates
        const existing = await agentsStorage.getAgent(req.params.id);
        if (!existing) {
          return res.status(404).json({ error: "Agent not found" });
        }

        const agentTier = req.body.agentTier || existing.agentTier || "agent";
        const assignedNamespaces = req.body.assignedNamespaces || existing.assignedNamespaces || [];
        
        const validation = validateNamespaceAssignment(agentTier, assignedNamespaces);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        // ADDITIONAL VALIDATION: For SubAgents, verify parent Agent exists
        if (agentTier === "subagent" && validation.rootNamespace) {
          const allAgents = await agentsStorage.listAgents();
          const parentAgents = allAgents.filter(
            (agent) => agent.agentTier === "agent" && agent.assignedNamespaces?.includes(validation.rootNamespace!)
          );

          if (parentAgents.length === 0) {
            return res.status(400).json({
              error: `Não existe Agent pai para o namespace "${validation.rootNamespace}". Crie primeiro um Agent com namespace "${validation.rootNamespace}" antes de atribuir esses subnamespaces.`
            });
          }
        }
      }

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
