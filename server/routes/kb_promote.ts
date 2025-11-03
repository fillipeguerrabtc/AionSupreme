// server/routes/kb_promote.ts
// Rota para promover respostas/conteúdo à Knowledge Base

import type { Router } from "express";
import { curationStore } from "../curation/store";
import { publishEvent } from "../events";

export function registerKbPromoteRoutes(app: Router) {
  /**
   * POST /api/kb/promote
   * Promove resposta ou conteúdo para a KB (envia para fila de curadoria)
   */
  app.post("/kb/promote", async (req, res) => {
    try {
      // SINGLE-TENANT: System operates with tenantId = 1
      const { text, suggestedNamespaces, title, submittedBy } = req.body;

      if (!text || !suggestedNamespaces || suggestedNamespaces.length === 0) {
        return res.status(400).json({
          error: "Missing required fields: text, suggestedNamespaces",
        });
      }

      // Criar item na fila de curadoria (tenantId defaults to 1 in curationStore)
      const item = await curationStore.addToCuration({
        title: title || "Conteúdo promovido",
        content: text,
        suggestedNamespaces,
        tags: ["promoted"],
        submittedBy: submittedBy || "user",
      });

      // Emitir evento
      await publishEvent("DOC_INGESTED", {
        docId: item.id,
        namespaces: ["curation/pending"],
      });

      res.status(201).json({
        success: true,
        curationId: item.id,
        message: "Conteúdo adicionado à fila de curadoria para revisão",
      });
    } catch (error: any) {
      console.error("[KB Promote] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
