/**
 * GenerateImage Tool - Geração de imagens via LLM function calling
 * 
 * Permite que o AION gere imagens quando usuário solicitar no chat
 * Usa CASCADE: Pollinations.ai (FREE) → HuggingFace (FREE) → DALL-E 3 (PAGO)
 */

import type { AgentObservation } from "../react-engine";
import { ImageGenerationCascade } from "../../generation/image-generation-cascade";

const imageGenCascade = new ImageGenerationCascade();

interface GenerateImageInput {
  prompt: string;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

/**
 * Gera imagem baseada em prompt do usuário
 * 
 * @param input - Parâmetros de geração
 * @returns Observation com URL da imagem gerada e attachments
 */
export async function generateImage(input: GenerateImageInput): Promise<AgentObservation> {
  try {
    const { prompt, size = "1024x1024", quality = "hd", style = "vivid" } = input;

    console.log(`[GenerateImage Tool] Generating image: "${prompt.slice(0, 60)}..."`);

    // Gerar imagem via CASCADE (Pollinations → HuggingFace → DALL-E)
    const result = await imageGenCascade.generateImage({
      prompt,
      size,
      quality,
      style,
    });

    console.log(`[GenerateImage Tool] ✅ Image generated via ${result.provider}: ${result.localPath}`);

    // Retornar observation com attachment
    return {
      observation: `Imagem gerada com sucesso: "${result.revisedPrompt}". Dimensões: ${result.width}x${result.height}`,
      success: true,
      attachments: [
        {
          type: "image",
          url: result.imageUrl,
          filename: `generated-${Date.now()}.png`,
          mimeType: "image/png",
          size: 0, // Size will be updated later
        },
      ],
      metadata: {
        revisedPrompt: result.revisedPrompt,
        originalPrompt: prompt,
        size,
        quality,
        style,
        width: result.width,
        height: result.height,
      },
    };
  } catch (error: any) {
    console.error(`[GenerateImage Tool] ❌ Error:`, error.message);

    // Retornar erro informativo para o usuário
    return {
      observation: `Erro ao gerar imagem: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
