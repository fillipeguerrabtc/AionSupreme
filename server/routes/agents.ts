// Rotas de gerenciamento de agentes
import type { Router } from "express";
import { agentsStorage } from "../storage.agents";
import { publishEvent } from "../events";
import { validateNamespaceAssignment, validateNamespacesExist } from "../agent/namespace-validators";
import { generateUniqueSlug } from "../utils/slug-generator";

export function registerAgentRoutes(app: Router) {
  app.get("/agents", async (req, res) => {
    try {
      const rows = await agentsStorage.listAgents();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/agents", async (req, res) => {
    try {
      // Validar que o nome foi fornecido
      if (!req.body.name) {
        return res.status(400).json({ error: "Nome do agente é obrigatório" });
      }

      // SEMPRE auto-gera slug a partir do nome (ignora qualquer slug do cliente por segurança)
      req.body.slug = await generateUniqueSlug(req.body.name);

      // Validar atribuição de namespace baseado no agentTier
      const agentTier = req.body.agentTier || "agent";
      const assignedNamespaces = req.body.assignedNamespaces || [];
      
      const validation = validateNamespaceAssignment(agentTier, assignedNamespaces);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // ORPHAN PREVENTION: Validar que todos os namespaces existem no banco de dados
      const existenceValidation = await validateNamespacesExist(assignedNamespaces);
      if (!existenceValidation.valid) {
        return res.status(400).json({ error: existenceValidation.error });
      }

      // VALIDAÇÃO ADICIONAL: Para SubAgents, verificar se o Agent pai existe
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
      
      // Re-check para detectar se novo agente é um curator
      // Isso permite auto-reconhecimento imediato de agentes de curadoria
      const { curatorAgentDetector } = await import("../curation/curator-agent");
      curatorAgentDetector.forceRecheck();
      
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/agents/:id", async (req, res) => {
    try {
      const row = await agentsStorage.getAgent(req.params.id);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/agents/:id", async (req, res) => {
    try {
      // SEGURANÇA: Slug é imutável - rejeitar qualquer tentativa de modificá-lo
      if (req.body.slug !== undefined) {
        return res.status(400).json({ 
          error: "Slug não pode ser modificado - é gerado automaticamente pelo sistema" 
        });
      }

      // Validar atribuição de namespace se estiver sendo atualizado
      if (req.body.agentTier || req.body.assignedNamespaces) {
        // Buscar agente existente para mesclar com atualizações
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

        // ORPHAN PREVENTION: Validar que todos os namespaces existem no banco de dados
        const existenceValidation = await validateNamespacesExist(assignedNamespaces);
        if (!existenceValidation.valid) {
          return res.status(400).json({ error: existenceValidation.error });
        }

        // VALIDAÇÃO ADICIONAL: Para SubAgents, verificar se o Agent pai existe
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
      
      // Re-check para detectar se agente atualizado virou curator
      const { curatorAgentDetector } = await import("../curation/curator-agent");
      curatorAgentDetector.forceRecheck();
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/agents/:id", async (req, res) => {
    try {
      const deleted = await agentsStorage.deleteAgent(req.params.id);
      await publishEvent("AGENT_DELETED", { agentId: req.params.id });
      res.json(deleted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
