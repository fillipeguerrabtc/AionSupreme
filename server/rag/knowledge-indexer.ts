/**
 * Knowledge Indexer - Index technical PDFs into RAG system
 * 
 * As per PDFs: All 7 technical whitepapers must be indexed and accessible:
 * - Parte I: Fundamentos Te óricos (Transformer, MoE, RoPE, etc.)
 * - Parte II: Arquitetura Sistêmica (Multimodal, RAG, Agent, Dashboard)
 * - Parte III-A/B/C/D: Implementação detalhada
 * - Apêndices A/B/C/D: Deduções matemáticas completas
 * 
 * Preserves LaTeX formulas and mathematical notation
 */

import { storage } from "../storage";
import { ragService } from "./vector-store";
import { FileProcessor } from "../multimodal/file-processor";
import fs from "fs/promises";
import path from "path";

interface PDFMetadata {
  filename: string;
  part: string;
  description: string;
}

// All 7 PDFs as specified in requirements
const TECHNICAL_PDFS: PDFMetadata[] = [
  {
    filename: "IA_Autonoma_Parte1_1761609508877.pdf",
    part: "Parte I",
    description: "Fundamentos Teóricos - Transformer Denso, MoE, RoPE, FlashAttention, LoRA, Cross-Entropy, AdamW, PPO/RLHF, Leis de Escalonamento"
  },
  {
    filename: "IA_Autonoma_Parte2_1761609508878.pdf",
    part: "Parte II",
    description: "Arquitetura Sistêmica - Multimodalidade (texto/imagem/áudio/vídeo), RAG/Memória Vetorial, Agência Autônoma ReAct, Dashboard de Políticas"
  },
  {
    filename: "IA_Autonoma_Parte3_1_1761609508879.pdf",
    part: "Parte III-A",
    description: "Modelo Transformer-MoE - Arquitetura, dedução matemática da atenção, RoPE, MoE com balanceamento, otimização"
  },
  {
    filename: "IA_Autonoma_Parte3_2_1761609508880.pdf",
    part: "Parte III-B",
    description: "Multimodalidade Completa - Encoders por modalidade, fusão, perdas conjuntas, RAG com embeddings semânticos"
  },
  {
    filename: "IA_Autonoma_Parte3_3_1761609508880.pdf",
    part: "Parte III-C",
    description: "Agência Autônoma - POMDP, ReAct, ferramentas, sandbox, eficiência computacional, separação de políticas"
  },
  {
    filename: "IA_Autonoma_Parte3_4_1761609508881.pdf",
    part: "Parte III-D",
    description: "Implementação e Deploy - Topologia de sistema, pipeline de inferência, quantização, checkpoints, execução no Replit"
  },
  {
    filename: "IA_Autonoma_Parte4_1761609508881.pdf",
    part: "Apêndices A/B/C/D",
    description: "Apêndices Matemáticos - Dedução completa da atenção escalonada, estabilidade MoE, derivação formal PPO, leis de escalonamento"
  },
];

export class KnowledgeIndexer {
  private fileProcessor = new FileProcessor();

  /**
   * Extract text from PDF preserving structure
   */
  private async extractPDFText(filePath: string): Promise<string> {
    try {
      const result = await this.fileProcessor.processFile(filePath, "application/pdf");
      if (result.error) {
        throw new Error(result.error);
      }
      return result.extractedText;
    } catch (error: any) {
      console.error(`[KnowledgeIndexer] Error extracting PDF ${filePath}:`, error);
      throw new Error(`Failed to extract PDF: ${error.message}`);
    }
  }

  /**
   * Preserve LaTeX formulas in text
   * Formulas are critical for the mathematical content
   */
  private preserveLatex(text: string): string {
    // Common LaTeX patterns in the PDFs
    const latexPatterns = [
      /\\frac\{[^}]+\}\{[^}]+\}/g,
      /\\sum_{[^}]+}(\^{[^}]+})?/g,
      /\\int_{[^}]+}(\^{[^}]+})?/g,
      /\\prod_{[^}]+}(\^{[^}]+})?/g,
      /\\alpha|\\beta|\\gamma|\\delta|\\theta|\\lambda|\\mu|\\sigma|\\tau|\\omega/g,
      /\\mathbf\{[^}]+\}/g,
      /\\text\{[^}]+\}/g,
    ];
    
    // Ensure formulas are properly spaced for chunking
    let processed = text;
    for (const pattern of latexPatterns) {
      processed = processed.replace(pattern, (match) => ` ${match} `);
    }
    
    return processed;
  }

  /**
   * Index a single PDF
   */
  async indexPDF(
    pdfMetadata: PDFMetadata
  ): Promise<number> {
    const filePath = path.join(process.cwd(), "attached_assets", pdfMetadata.filename);
    
    console.log(`[KnowledgeIndexer] Indexing ${pdfMetadata.part}: ${pdfMetadata.filename}...`);
    
    try {
      // Check if file exists
      await fs.access(filePath);
    } catch {
      console.error(`[KnowledgeIndexer] File not found: ${filePath}`);
      throw new Error(`PDF file not found: ${pdfMetadata.filename}`);
    }
    
    // Extract text
    const rawText = await this.extractPDFText(filePath);
    const text = this.preserveLatex(rawText);
    
    // Create document record
    const document = await storage.createDocument({
      filename: pdfMetadata.filename,
      mimeType: "application/pdf",
      size: (await fs.stat(filePath)).size,
      storageUrl: filePath,
      extractedText: text,
      status: "pending",
      metadata: {
        part: pdfMetadata.part,
        description: pdfMetadata.description,
        title: pdfMetadata.part,
      },
    });
    
    // Index with RAG service
    await ragService.indexDocument(document.id, text, {
      part: pdfMetadata.part,
      section: pdfMetadata.description,
    });
    
    console.log(`[KnowledgeIndexer] ✅ Indexed ${pdfMetadata.part} (Document ID: ${document.id})`);
    
    return document.id;
  }

  /**
   * Index all 7 technical PDFs
   * This is the complete knowledge base required by the system
   */
  async indexAllPDFs(): Promise<number[]> {
    console.log(`[KnowledgeIndexer] 📚 Indexing ALL 7 technical PDFs...`);
    console.log(`[KnowledgeIndexer] Total PDFs: ${TECHNICAL_PDFS.length}`);
    
    const documentIds: number[] = [];
    let succeeded = 0;
    let failed = 0;
    
    for (const pdfMeta of TECHNICAL_PDFS) {
      try {
        const docId = await this.indexPDF(pdfMeta);
        documentIds.push(docId);
        succeeded++;
      } catch (error: any) {
        console.error(`[KnowledgeIndexer] ❌ Failed to index ${pdfMeta.part}:`, error.message);
        failed++;
      }
    }
    
    console.log(`\n[KnowledgeIndexer] 🎉 Knowledge base indexing complete!`);
    console.log(`[KnowledgeIndexer] ✅ Succeeded: ${succeeded}/${TECHNICAL_PDFS.length}`);
    console.log(`[KnowledgeIndexer] ❌ Failed: ${failed}/${TECHNICAL_PDFS.length}`);
    console.log(`[KnowledgeIndexer] 📊 Document IDs: ${documentIds.join(", ")}`);
    
    return documentIds;
  }

  /**
   * Search technical knowledge base
   */
  async searchKnowledge(
    query: string,
    options: {
      k?: number;
      part?: string; // Filter by specific part
    } = {}
  ): Promise<Array<{
    text: string;
    part: string;
    score: number;
    citationId: string;
  }>> {
    const results = await ragService.search(query, {
      k: options.k || 10,
    });
    
    // Filter by part if specified
    let filtered = results;
    if (options.part) {
      filtered = results.filter(r => r.metadata?.part === options.part);
    }
    
    // Format with citations
    return filtered.map((result, idx) => ({
      text: result.chunkText,
      part: result.metadata?.part || "Unknown",
      score: result.score,
      citationId: `[${idx + 1}]`,
    }));
  }

  /**
   * Get available parts
   */
  getAvailableParts(): PDFMetadata[] {
    return TECHNICAL_PDFS;
  }

  /**
   * Index a single document by ID and content
   */
  async indexDocument(
    documentId: number, 
    content: string, 
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`[KnowledgeIndexer] Indexing document ${documentId}...`);
    await ragService.indexDocument(documentId, content, metadata || {});
    console.log(`[KnowledgeIndexer] ✅ Document ${documentId} indexed`);
  }

  /**
   * Re-index a document (delete old embeddings and create new ones)
   */
  async reIndexDocument(documentId: number): Promise<void> {
    console.log(`[KnowledgeIndexer] Re-indexing document ${documentId}...`);
    
    // Delete existing embeddings for this document
    await storage.deleteEmbeddingsByDocument(documentId);
    
    // Get document to re-index
    const doc = await storage.getDocument(documentId);
    if (!doc || !doc.extractedText) {
      throw new Error(`Document ${documentId} not found or has no extracted text`);
    }
    
    // Re-index with existing content
    await ragService.indexDocument(documentId, doc.extractedText, doc.metadata || {});
    
    console.log(`[KnowledgeIndexer] ✅ Document ${documentId} re-indexed`);
  }
}

// Singleton instance
export const knowledgeIndexer = new KnowledgeIndexer();
