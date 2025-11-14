/**
 * TransformImage Tool - Image-to-Image transformation via Stable Diffusion
 * 
 * Permite que AION transforme imagens existentes com prompts
 * Usa CASCADE: SD-XL GPU Workers → Pollinations → DALL-E img2img
 * 
 * FEATURES:
 * - KB Similarity Search: Find reference images from knowledge base
 * - Direct URL: Use user-provided image URL
 * - GPU-First: Prioriza workers SD-XL locais
 * - Auto-fallback: Falls back to external APIs se necessário
 */

import type { AgentObservation } from "../react-engine";
import { ImageGenerationCascade } from "../../generation/image-generation-cascade";
import { db } from "../../db";
import { documents, embeddings } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { embedder } from "../../rag/embedder";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

const imageGenCascade = new ImageGenerationCascade();

interface TransformImageInput {
  prompt: string;
  referenceImage?: string; // URL or file path
  kbSearchQuery?: string; // Semantic search in KB images
  strength?: number; // 0.0-1.0 (how much to change)
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

/**
 * KB Similarity Search - Find best matching image from knowledge base
 * PRODUCTION REQUIREMENT: ALWAYS returns best match, caller decides GPU usage based on similarity
 */
async function findKBImage(searchQuery: string): Promise<{ url: string; description: string; similarity: number } | null> {
  try {
    console.log(`[TransformImage] 🔍 Searching KB for: "${searchQuery}"`);
    
    // CRITICAL FIX: Truncate query to prevent "maximum context length" error
    const MAX_QUERY_TOKENS = 1000;
    const MAX_QUERY_CHARS = MAX_QUERY_TOKENS * 4;
    const truncatedQuery = searchQuery.length > MAX_QUERY_CHARS ? searchQuery.substring(0, MAX_QUERY_CHARS) : searchQuery;
    
    if (searchQuery.length > MAX_QUERY_CHARS) {
      console.warn(`[TransformImage] Query truncated from ${searchQuery.length} to ${MAX_QUERY_CHARS} chars`);
    }
    
    // Generate embedding for search query
    const [queryEmbedding] = await embedder.generateEmbeddings([{
      text: truncatedQuery,
      index: 0,
      tokens: Math.ceil(truncatedQuery.length / 4)
    }]);
    
    // Query image documents from KB
    const imageDocuments = await db
      .select({
        documentId: documents.id,
        filename: documents.filename,
        storageUrl: documents.storageUrl,
        description: documents.extractedText,
        embedding: sql<number[]>`${embeddings.embedding}::jsonb`,
      })
      .from(documents)
      .innerJoin(embeddings, eq(documents.id, embeddings.documentId))
      .where(
        and(
          sql`${documents.mimeType} LIKE 'image/%'`,
          sql`${documents.storageUrl} IS NOT NULL`
        )
      )
      .limit(50); // Pre-filter candidates

    if (imageDocuments.length === 0) {
      console.warn(`[TransformImage] ⚠️ No images found in KB`);
      return null;
    }

    // Calculate similarity scores
    const scoredResults = imageDocuments.map(doc => {
      const docEmbedding = Array.isArray(doc.embedding) 
        ? doc.embedding 
        : JSON.parse(doc.embedding as any);
      
      const similarity = embedder.cosineSimilarity(
        queryEmbedding.embedding, 
        docEmbedding
      );
      
      return {
        url: doc.storageUrl!,
        description: doc.description || '',
        similarity
      };
    });

    // Sort by similarity and ALWAYS return best match
    scoredResults.sort((a, b) => b.similarity - a.similarity);
    const bestMatch = scoredResults[0];
    
    console.log(`[TransformImage] ✅ Found best KB match (similarity: ${bestMatch.similarity.toFixed(3)}): ${bestMatch.url}`);
    
    return {
      url: bestMatch.url,
      description: bestMatch.description,
      similarity: bestMatch.similarity
    };
  } catch (error: any) {
    console.error(`[TransformImage] ❌ KB search failed:`, error.message);
    return null;
  }
}

/**
 * Download image from URL to buffer
 */
async function downloadImage(imageUrl: string): Promise<Buffer> {
  // Check if it's a local file path
  if (imageUrl.startsWith('/kb_storage/') || imageUrl.startsWith('kb_storage/')) {
    const localPath = imageUrl.startsWith('/') 
      ? path.join(process.cwd(), imageUrl.slice(1))
      : path.join(process.cwd(), imageUrl);
    
    return await fs.readFile(localPath);
  }
  
  // Download from URL
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

/**
 * Transform image using img2img
 */
export async function transformImage(input: TransformImageInput): Promise<AgentObservation> {
  try {
    const { 
      prompt, 
      referenceImage, 
      kbSearchQuery,
      strength = 0.75,
      quality = "standard", 
      style = "vivid" 
    } = input;

    console.log(`[TransformImage Tool] Transforming image: "${prompt.slice(0, 60)}..."`);

    // 1. Determine reference image source and validate GPU usage criteria
    let imageUrl: string | null = null;
    let imageSource = '';
    let kbConfidence: number | null = null;
    let useGPU = false;
    
    if (kbSearchQuery) {
      // KB Similarity Search - always returns best match
      const kbImage = await findKBImage(kbSearchQuery);
      
      if (!kbImage) {
        // No images in KB at all
        return {
          observation: `❌ KB Search: Nenhuma imagem encontrada na Knowledge Base para: "${kbSearchQuery}"`,
          success: false,
          errorMessage: 'KB search returned no results'
        };
      }
      
      // Use best match - decide GPU usage based on confidence threshold
      imageUrl = kbImage.url;
      kbConfidence = kbImage.similarity;
      useGPU = kbConfidence >= 0.7; // PRODUCTION REQUIREMENT: GPU ONLY if confidence >= 0.7
      
      if (useGPU) {
        imageSource = `KB search (HIGH confidence: ${kbConfidence.toFixed(3)} >= 0.7): "${kbSearchQuery}"`;
        console.log(`[TransformImage] ✅ GPU usage APPROVED (confidence: ${kbConfidence.toFixed(3)})`);
      } else {
        imageSource = `KB search (LOW confidence: ${kbConfidence.toFixed(3)} < 0.7): "${kbSearchQuery}"`;
        console.log(`[TransformImage] ⚠️ GPU usage DENIED - Using best match WITHOUT GPU (similarity: ${kbConfidence.toFixed(3)})`);
      }
      
    } else if (referenceImage) {
      // Direct URL/path - NO GPU usage (no confidence metric)
      // User requirement: GPU ONLY for KB-based inference with confidence >= 0.7
      imageUrl = referenceImage;
      imageSource = `Direct reference: ${referenceImage}`;
      kbConfidence = null;
      useGPU = false; // No KB confidence metric available
      
      console.log(`[TransformImage] 🚫 GPU usage DENIED (direct upload, no KB confidence metric)`);
      
    } else {
      return {
        observation: `Você deve fornecer 'referenceImage' (URL) ou 'kbSearchQuery' (busca semântica na KB)`,
        success: false,
        errorMessage: 'Missing reference image source'
      };
    }

    console.log(`[TransformImage] 📸 Using image source: ${imageSource}`);

    // 2. Download reference image
    const imageBuffer = await downloadImage(imageUrl);
    
    // 3. Generate transformed image via CASCADE
    // CRITICAL: Pass useGPU flag to enforce confidence-based GPU gating
    const result = await imageGenCascade.generateImageFromImage({
      prompt,
      imageBuffer,
      strength,
      quality,
      style,
      useGPU, // Production requirement: GPU ONLY if confidence >= 0.7
    });

    console.log(`[TransformImage Tool] ✅ Image transformed via ${result.provider}: ${result.localPath}`);

    // 4. Return observation with attachment
    return {
      observation: `Imagem transformada com sucesso usando: ${imageSource}. Nova descrição: "${prompt}". Força de transformação: ${strength * 100}%`,
      success: true,
      attachments: [
        {
          type: "image",
          url: result.imageUrl,
          filename: `transformed-${Date.now()}.png`,
          mimeType: "image/png",
          size: 0,
        },
      ],
      metadata: {
        prompt,
        imageSource,
        strength,
        quality,
        style,
        width: result.width,
        height: result.height,
        provider: result.provider,
      },
    };
  } catch (error: any) {
    console.error(`[TransformImage Tool] ❌ Error:`, error.message);

    return {
      observation: `Erro ao transformar imagem: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
