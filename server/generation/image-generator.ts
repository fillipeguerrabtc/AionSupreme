/**
 * Image Generator Service
 * 
 * Generates images using DALL-E 3 (OpenAI)
 * 
 * IMPORTANT: ZERO censorship from AION side.
 * If DALL-E blocks, we log it and inform user clearly.
 */

import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import axios from "axios";

export class ImageGenerator {
  private openai: OpenAI;
  private storageDir: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || "";
    this.openai = new OpenAI({ apiKey });
    this.storageDir = path.join(process.cwd(), "server", "generated");
  }

  /**
   * Generate image using DALL-E 3
   * Returns: { imageUrl, localPath, revisedPrompt }
   */
  async generateImage(params: {
    prompt: string;
    size?: "1024x1024" | "1024x1792" | "1792x1024";
    quality?: "standard" | "hd";
    style?: "vivid" | "natural";
  }): Promise<{
    imageUrl: string;
    localPath: string;
    revisedPrompt: string;
    width: number;
    height: number;
  }> {
    const { prompt, size = "1024x1024", quality = "hd", style = "vivid" } = params;

    console.log(`[ImageGen] Generating image with DALL-E 3: "${prompt.slice(0, 60)}..."`);

    try {
      // Call DALL-E 3
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size,
        quality,
        style,
        response_format: "url",
      });

      const imageData = response.data[0];
      const imageUrl = imageData.url;
      const revisedPrompt = imageData.revised_prompt || prompt;

      if (!imageUrl) {
        throw new Error("DALL-E returned no image URL");
      }

      console.log(`[ImageGen] ✓ Image generated, downloading...`);

      // Download image to local storage
      const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const imageBuffer = Buffer.from(imageResponse.data);

      // Generate filename
      const filename = `${crypto.randomBytes(16).toString("hex")}.png`;
      const localPath = path.join(this.storageDir, filename);

      // Save to disk
      await fs.mkdir(this.storageDir, { recursive: true });
      await fs.writeFile(localPath, imageBuffer);

      console.log(`[ImageGen] ✓ Image saved to ${localPath}`);

      // Parse dimensions
      const [width, height] = size.split("x").map(Number);

      return {
        imageUrl,
        localPath,
        revisedPrompt,
        width,
        height,
      };
    } catch (error: any) {
      // Check if DALL-E blocked due to content policy
      if (error.message?.includes("content_policy") || error.message?.includes("safety")) {
        console.log(`[ImageGen] ⚠️  DALL-E blocked due to content policy: ${error.message}`);
        throw new Error(
          "DALL-E blocked this image generation due to OpenAI's content policy. " +
          "AION has NO restrictions, but the underlying provider (OpenAI) does. " +
          "We cannot override their safety filters for image generation at this time."
        );
      }

      console.error(`[ImageGen] Error generating image:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up expired files (older than 1 hour)
   */
  async cleanupExpiredFiles(): Promise<number> {
    const files = await fs.readdir(this.storageDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(this.storageDir, file);
      const stats = await fs.stat(filePath);

      if (stats.mtimeMs < oneHourAgo) {
        await fs.unlink(filePath);
        deletedCount++;
        console.log(`[ImageGen] Deleted expired file: ${file}`);
      }
    }

    return deletedCount;
  }
}

export const imageGenerator = new ImageGenerator();
