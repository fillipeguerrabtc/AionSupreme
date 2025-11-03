/**
 * KNOWLEDGE BASE IMAGES ROUTES
 * API para busca semântica de imagens indexadas na KB
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { documents, embeddings } from "../../shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { embedder } from "../rag/embedder";
import { rateLimitMiddleware } from "../middleware/rate-limit";

export function registerKbImagesRoutes(app: Express) {
  console.log("[KB Images Routes] Registering KB Image Search routes...");
  
  // REMOVED: Rate limiting already applied globally in routes.ts via app.use("/api", ...)
  // Keeping it here would cause double rate limiting (each request counted 2x)

  /**
   * GET /api/kb/images
   * Lista todas as imagens indexadas na KB
   */
  app.get("/kb/images", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Buscar documentos que são imagens (status=indexed, mimeType começa com image/)
      const images = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.status, "indexed"),
            sql`${documents.mimeType} LIKE 'image/%'`
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(sql`${documents.createdAt} DESC`);

      // Contar total
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(
            eq(documents.status, "indexed"),
            sql`${documents.mimeType} LIKE 'image/%'`
          )
        );

      res.json({
        success: true,
        data: {
          images,
          total: countResult?.count || 0,
          limit,
          offset
        }
      });
    } catch (error: any) {
      console.error("[KB Images Routes] Error listing images:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/kb/images/search
   * Busca semântica de imagens usando descrições geradas pelo Vision
   */
  app.post("/kb/images/search", async (req: Request, res: Response) => {
    try {
      const { query, limit = 10, namespaces = [] } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      console.log(`[KB Images Search] Searching for: "${query}"`);

      // Gerar embedding da query (must be TextChunk format)
      const [queryEmbedding] = await embedder.generateEmbeddings([
        { text: query, index: 0, tokens: Math.ceil(query.length / 4) }
      ]);

      // Buscar documentos que sejam imagens com embeddings
      // NOTE: Can't use pgvector operators because embedding column is jsonb, not vector type
      // CRITICAL: Apply namespace filtering + LIMIT in SQL for security and performance
      const conditions = [
        eq(documents.status, "indexed"),
        sql`${documents.mimeType} LIKE 'image/%'`
      ];
      
      // Apply namespace filtering if specified (CRITICAL for multi-agent isolation)
      if (namespaces.length > 0) {
        conditions.push(
          sql`${documents.metadata}->>'namespace' = ANY(${namespaces}::text[])`
        );
      }
      
      // PERFORMANCE FIX: Cap SQL result set before in-memory similarity scoring
      // Fetch at most 10x the requested limit to balance recall vs memory usage
      const maxCandidates = Math.min(limit * 10, 500);
      
      const imageDocuments = await db
        .select({
          documentId: documents.id,
          filename: documents.filename,
          mimeType: documents.mimeType,
          storageUrl: documents.storageUrl,
          description: documents.extractedText,
          metadata: documents.metadata,
          createdAt: documents.createdAt,
          embedding: sql<number[]>`${embeddings.embedding}::jsonb`,
        })
        .from(documents)
        .innerJoin(embeddings, eq(documents.id, embeddings.documentId))
        .where(and(...conditions))
        .orderBy(sql`${documents.createdAt} DESC`)
        .limit(maxCandidates);

      // Calculate similarity scores in-memory (same approach as VectorStore)
      const scoredResults = imageDocuments.map(doc => {
        // embedding is stored as jsonb array, parse if needed
        const docEmbedding = Array.isArray(doc.embedding) 
          ? doc.embedding 
          : JSON.parse(doc.embedding as any);
        
        const similarity = embedder.cosineSimilarity(
          queryEmbedding.embedding, 
          docEmbedding
        );
        
        return {
          id: doc.documentId,
          filename: doc.filename,
          mimeType: doc.mimeType,
          storageUrl: doc.storageUrl,
          description: doc.description,
          metadata: doc.metadata,
          createdAt: doc.createdAt,
          similarity
        };
      });

      // Sort by similarity descending and take top-k
      scoredResults.sort((a, b) => b.similarity - a.similarity);
      const results = scoredResults.slice(0, limit);

      res.json({
        success: true,
        data: {
          query,
          results,
          total: results.length
        }
      });
    } catch (error: any) {
      console.error("[KB Images Search] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/kb/images/:id
   * Retorna detalhes de uma imagem específica
   */
  app.get("/kb/images/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);

      const [image] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, imageId),
            eq(documents.status, "indexed"),
            sql`${documents.mimeType} LIKE 'image/%'`
          )
        );

      if (!image) {
        return res.status(404).json({ error: "Image not found" });
      }

      res.json({
        success: true,
        data: image
      });
    } catch (error: any) {
      console.error("[KB Images Routes] Error getting image:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/kb/images/:id
   * Remove uma imagem da KB (cascade delete)
   */
  app.delete("/kb/images/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);

      // Verificar se existe e é imagem
      const [image] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, imageId),
            sql`${documents.mimeType} LIKE 'image/%'`
          )
        );

      if (!image) {
        return res.status(404).json({ error: "Image not found" });
      }

      // CRITICAL: Delete physical file from disk BEFORE deleting from database
      if (image.storageUrl) {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        // Handle both relative and absolute paths
        const filePath = path.isAbsolute(image.storageUrl)
          ? image.storageUrl
          : path.join(process.cwd(), image.storageUrl);
        
        try {
          await fs.unlink(filePath);
          console.log(`[KB Images] ✅ Deleted physical file: ${filePath}`);
        } catch (err: any) {
          // Log warning but don't fail the request (file might already be deleted)
          console.warn(`[KB Images] ⚠️ Failed to delete file ${filePath}: ${err.message}`);
        }
      }

      // Delete from database (embeddings cascade automatically via FK)
      await db.delete(documents).where(eq(documents.id, imageId));

      res.json({
        success: true,
        message: "Image deleted successfully (file + database)",
        deletedId: imageId
      });
    } catch (error: any) {
      console.error("[KB Images Routes] Error deleting image:", error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[KB Images Routes] ✅ 4 KB Image Search routes registered successfully");
}
