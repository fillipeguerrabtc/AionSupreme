// server/routes/kb_promote.ts
// Rota para promover respostas/conteúdo à Knowledge Base

import type { Express } from "express";
import { curationStore } from "../curation/store";
import { publishEvent } from "../events";

export function registerKbPromoteRoutes(app: Express) {
  /**
   * POST /api/kb/promote
   * Promove resposta ou conteúdo para a KB (envia para fila de curadoria)
   */
  app.post("/api/kb/promote", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { text, suggestedNamespaces, title, submittedBy } = req.body;

      if (!text || !suggestedNamespaces || suggestedNamespaces.length === 0) {
        return res.status(400).json({
          error: "Missing required fields: text, suggestedNamespaces",
        });
      }

      // Criar item na fila de curadoria
      const item = await curationStore.addToCuration(tenantId, {
        title: title || "Conteúdo promovido",
        content: text,
        suggestedNamespaces,
        tags: ["promoted"],
        submittedBy: submittedBy || "user",
      });

      // Emitir evento
      await publishEvent("DOC_INGESTED", {
        tenantId,
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
