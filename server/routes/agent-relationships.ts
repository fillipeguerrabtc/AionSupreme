// server/routes/agent-relationships.ts
import type { Express } from "express";
import { agentRelationshipsStorage } from "../storage.agent-relationships";

export function registerAgentRelationshipRoutes(app: Express) {
  // GET /api/agent-relationships - List all relationships
  app.get("/api/agent-relationships", async (req, res) => {
    try {
      const relationships = await agentRelationshipsStorage.listAll();
      res.json(relationships);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agent-relationships/parent/:parentId - Get children of a parent
  app.get("/api/agent-relationships/parent/:parentId", async (req, res) => {
    try {
      const relationships = await agentRelationshipsStorage.getByParent(req.params.parentId);
      res.json(relationships);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agent-relationships/child/:childId - Get parents of a child
  app.get("/api/agent-relationships/child/:childId", async (req, res) => {
    try {
      const relationships = await agentRelationshipsStorage.getByChild(req.params.childId);
      res.json(relationships);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agent-relationships - Create new relationship
  app.post("/api/agent-relationships", async (req, res) => {
    try {
      const { parentAgentId, childAgentId, budgetSharePercent, delegationMode, maxDepth, toolDelta, namespaceSuffix } = req.body;

      // Validation
      if (!parentAgentId || !childAgentId) {
        return res.status(400).json({ error: "parentAgentId and childAgentId are required" });
      }

      if (parentAgentId === childAgentId) {
        return res.status(400).json({ error: "Agent cannot be its own parent" });
      }

      // Check for cycle
      const wouldCycle = await agentRelationshipsStorage.wouldCreateCycle(parentAgentId, childAgentId);
      if (wouldCycle) {
        return res.status(400).json({ error: "This relationship would create a cycle in the hierarchy" });
      }

      // Normalize budgetSharePercent to 0-1 range if provided as percentage
      let normalizedBudget = budgetSharePercent;
      if (normalizedBudget !== undefined) {
        normalizedBudget = normalizedBudget > 1 ? normalizedBudget / 100 : normalizedBudget;
      }

      const relationship = await agentRelationshipsStorage.create({
        parentAgentId,
        childAgentId,
        delegationMode,
        budgetSharePercent: normalizedBudget,
        maxDepth,
        toolDelta,
        namespaceSuffix,
      });

      res.status(201).json(relationship);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/agent-relationships/:id - Update relationship
  app.patch("/api/agent-relationships/:id", async (req, res) => {
    try {
      const { budgetSharePercent, delegationMode, maxDepth, toolDelta, namespaceSuffix } = req.body;

      // Normalize budgetSharePercent if provided
      let normalizedBudget = budgetSharePercent;
      if (normalizedBudget !== undefined) {
        normalizedBudget = normalizedBudget > 1 ? normalizedBudget / 100 : normalizedBudget;
      }

      const updated = await agentRelationshipsStorage.update(Number(req.params.id), {
        budgetSharePercent: normalizedBudget,
        delegationMode,
        maxDepth,
        toolDelta,
        namespaceSuffix,
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/agent-relationships/:id - Soft delete relationship
  app.delete("/api/agent-relationships/:id", async (req, res) => {
    try {
      const deleted = await agentRelationshipsStorage.delete(Number(req.params.id));
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
