import fs from "fs/promises";
import path from "path";
import { DatasetValidator } from "./dataset-validator";
import type { InsertDataset } from "@shared/schema";

export interface ProcessDatasetOptions {
  userId?: string;
  name: string;
  description?: string;
  datasetType: string;
  originalFilename: string;
  tempFilePath: string;
  fileSize: number;
  mimeType: string;
}

export interface ProcessDatasetResult {
  success: boolean;
  dataset?: InsertDataset;
  error?: string;
}

export class DatasetProcessor {
  private static STORAGE_DIR = "uploaded_datasets";

  static async processDataset(
    options: ProcessDatasetOptions
  ): Promise<ProcessDatasetResult> {
    const {
      userId,
      name,
      description,
      datasetType,
      originalFilename,
      tempFilePath,
      fileSize,
      mimeType,
    } = options;

    try {
      // 1. Validate file
      const validation = await DatasetValidator.validateFile(
        tempFilePath,
        originalFilename,
        mimeType,
        fileSize
      );

      if (!validation.isValid) {
        // Clean up temp file on validation failure
        try {
          await fs.unlink(tempFilePath);
        } catch (e) {
          console.warn("Failed to delete temp file after validation failure:", e);
        }
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(", ")}`,
        };
      }

      // 2. Create storage directory if doesn't exist
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });

      // 3. Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = name
        .replace(/[^a-z0-9_-]/gi, "_")
        .toLowerCase();
      const ext = path.extname(originalFilename);
      const storedFilename = `${sanitizedName}_${timestamp}${ext}`;
      const storagePath = path.join(this.STORAGE_DIR, storedFilename);

      // 4. Move file to permanent storage
      await fs.copyFile(tempFilePath, storagePath);

      // 5. Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch (e) {
        console.warn("Failed to delete temp file:", e);
      }

      // 6. Create dataset record (tenantId defaults to 1 in schema)
      const dataset: InsertDataset = {
        userId: userId || null,
        name,
        description: description || null,
        datasetType,
        originalFilename,
        fileSize,
        fileMimeType: mimeType,
        storagePath,
        totalExamples: validation.stats?.totalExamples || 0,
        averageLength: validation.stats?.averageLength || null,
        minLength: validation.stats?.minLength || null,
        maxLength: validation.stats?.maxLength || null,
        status: "ready",
        processingError: null,
        isValid: true,
        validationErrors: validation.errors.length > 0 ? validation.errors : null,
        schema: validation.schema || null,
      };

      return {
        success: true,
        dataset,
      };
    } catch (error) {
      return {
        success: false,
        error: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  static async deleteDataset(storagePath: string): Promise<void> {
    try {
      await fs.unlink(storagePath);
    } catch (error) {
      console.error("Failed to delete dataset file:", error);
      throw error;
    }
  }

  static async getDatasetContent(
    storagePath: string,
    maxLines?: number
  ): Promise<string> {
    try {
      const content = await fs.readFile(storagePath, "utf-8");

      if (maxLines) {
        const lines = content.split("\n");
        return lines.slice(0, maxLines).join("\n");
      }

      return content;
    } catch (error) {
      throw new Error(
        `Failed to read dataset: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
