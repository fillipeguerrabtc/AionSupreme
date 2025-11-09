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
 */
async function findKBImage(searchQuery: string): Promise<{ url: string; description: string } | null> {
  try {
    console.log(`[TransformImage] 🔍 Searching KB for: "${searchQuery}"`);
    
    // Generate embedding for search query
    const [queryEmbedding] = await embedder.generateEmbeddings([{
      text: searchQuery,
      index: 0,
      tokens: Math.ceil(searchQuery.length / 4)
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

    // Sort by similarity and get best match
    scoredResults.sort((a, b) => b.similarity - a.similarity);
    const bestMatch = scoredResults[0];
    
    console.log(`[TransformImage] ✅ Found KB image (similarity: ${bestMatch.similarity.toFixed(3)}): ${bestMatch.url}`);
    
    return {
      url: bestMatch.url,
      description: bestMatch.description
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

    // 1. Determine reference image source
    let imageUrl: string | null = null;
    let imageSource = '';
    
    if (kbSearchQuery) {
      // KB Similarity Search
      const kbImage = await findKBImage(kbSearchQuery);
      if (kbImage) {
        imageUrl = kbImage.url;
        imageSource = `KB search: "${kbSearchQuery}" (found: ${kbImage.description.slice(0, 50)}...)`;
      } else {
        return {
          observation: `Nenhuma imagem encontrada na Knowledge Base para: "${kbSearchQuery}"`,
          success: false,
          errorMessage: 'KB search returned no results'
        };
      }
    } else if (referenceImage) {
      // Direct URL/path
      imageUrl = referenceImage;
      imageSource = `Direct reference: ${referenceImage}`;
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
    const result = await imageGenCascade.generateImageFromImage({
      prompt,
      imageBuffer,
      strength,
      quality,
      style,
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
