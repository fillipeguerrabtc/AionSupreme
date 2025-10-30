import fs from "fs/promises";
import path from "path";

export interface DatasetValidation {
  isValid: boolean;
  errors: string[];
  stats?: {
    totalExamples: number;
    averageLength?: number;
    minLength?: number;
    maxLength?: number;
  };
  schema?: {
    columns?: string[];
    inputField?: string;
    outputField?: string;
    format?: string;
  };
}

export class DatasetValidator {
  private static MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  private static SUPPORTED_FORMATS = [
    ".jsonl",
    ".json",
    ".csv",
    ".txt",
    ".tsv",
  ];

  static async validateFile(
    filePath: string,
    originalFilename: string,
    mimeType: string,
    fileSize: number
  ): Promise<DatasetValidation> {
    const errors: string[] = [];

    // Size validation
    if (fileSize > this.MAX_FILE_SIZE) {
      errors.push(
        `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
      );
      return { isValid: false, errors };
    }

    // Format validation - use original filename, not temp path
    const ext = path.extname(originalFilename).toLowerCase();
    if (!this.SUPPORTED_FORMATS.includes(ext)) {
      errors.push(
        `Unsupported format ${ext}. Supported: ${this.SUPPORTED_FORMATS.join(", ")}`
      );
      return { isValid: false, errors };
    }

    try {
      // Read and validate content based on format
      const content = await fs.readFile(filePath, "utf-8");

      switch (ext) {
        case ".jsonl":
          return await this.validateJSONL(content);
        case ".json":
          return await this.validateJSON(content);
        case ".csv":
        case ".tsv":
          return await this.validateCSV(content, ext === ".tsv" ? "\t" : ",");
        case ".txt":
          return await this.validatePlainText(content);
        default:
          errors.push(`Validation not implemented for ${ext}`);
          return { isValid: false, errors };
      }
    } catch (error) {
      errors.push(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
      );
      return { isValid: false, errors };
    }
  }

  private static async validateJSONL(
    content: string
  ): Promise<DatasetValidation> {
    const errors: string[] = [];
    const lines = content.trim().split("\n");

    if (lines.length === 0) {
      errors.push("JSONL file is empty");
      return { isValid: false, errors };
    }

    const examples: any[] = [];
    const lengths: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      try {
        const obj = JSON.parse(line);
        examples.push(obj);

        // Calculate length for text-based examples
        const text =
          obj.text ||
          obj.prompt ||
          obj.instruction ||
          obj.input ||
          JSON.stringify(obj);
        lengths.push(text.length);
      } catch (e) {
        errors.push(`Line ${i + 1}: Invalid JSON - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (examples.length === 0) {
      errors.push("No valid examples found in JSONL file");
      return { isValid: false, errors };
    }

    // Detect schema from first example
    const firstExample = examples[0];
    const schema = {
      format: "jsonl" as const,
      columns: Object.keys(firstExample),
      inputField: firstExample.instruction
        ? "instruction"
        : firstExample.prompt
          ? "prompt"
          : firstExample.input
            ? "input"
            : undefined,
      outputField: firstExample.output
        ? "output"
        : firstExample.response
          ? "response"
          : firstExample.completion
            ? "completion"
            : undefined,
    };

    return {
      isValid: errors.length === 0,
      errors,
      stats: {
        totalExamples: examples.length,
        averageLength: Math.round(
          lengths.reduce((a, b) => a + b, 0) / lengths.length
        ),
        minLength: Math.min(...lengths),
        maxLength: Math.max(...lengths),
      },
      schema,
    };
  }

  private static async validateJSON(
    content: string
  ): Promise<DatasetValidation> {
    const errors: string[] = [];

    try {
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        errors.push("JSON file must contain an array of examples");
        return { isValid: false, errors };
      }

      if (data.length === 0) {
        errors.push("JSON array is empty");
        return { isValid: false, errors };
      }

      const lengths: number[] = [];

      for (const item of data) {
        const text =
          item.text ||
          item.prompt ||
          item.instruction ||
          item.input ||
          JSON.stringify(item);
        lengths.push(text.length);
      }

      // Detect schema
      const firstExample = data[0];
      const schema = {
        format: "json" as const,
        columns: Object.keys(firstExample),
        inputField: firstExample.instruction
          ? "instruction"
          : firstExample.prompt
            ? "prompt"
            : firstExample.input
              ? "input"
              : undefined,
        outputField: firstExample.output
          ? "output"
          : firstExample.response
            ? "response"
            : firstExample.completion
              ? "completion"
              : undefined,
      };

      return {
        isValid: true,
        errors: [],
        stats: {
          totalExamples: data.length,
          averageLength: Math.round(
            lengths.reduce((a, b) => a + b, 0) / lengths.length
          ),
          minLength: Math.min(...lengths),
          maxLength: Math.max(...lengths),
        },
        schema,
      };
    } catch (e) {
      errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return { isValid: false, errors };
    }
  }

  private static async validateCSV(
    content: string,
    delimiter: string
  ): Promise<DatasetValidation> {
    const errors: string[] = [];
    const lines = content.trim().split("\n");

    if (lines.length < 2) {
      errors.push("CSV file must have at least a header and one data row");
      return { isValid: false, errors };
    }

    const headers = lines[0].split(delimiter).map((h) => h.trim());
    const dataLines = lines.slice(1).filter((line) => line.trim());

    if (dataLines.length === 0) {
      errors.push("CSV file has no data rows");
      return { isValid: false, errors };
    }

    const lengths: number[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const values = dataLines[i].split(delimiter);
      if (values.length !== headers.length) {
        errors.push(
          `Row ${i + 2}: Column count mismatch (expected ${headers.length}, got ${values.length})`
        );
      }

      // Calculate approximate length
      lengths.push(dataLines[i].length);
    }

    const format = delimiter === "\t" ? "tsv" : "csv";
    const schema = {
      format,
      columns: headers,
      inputField: headers.find(
        (h) =>
          h.toLowerCase().includes("input") ||
          h.toLowerCase().includes("prompt") ||
          h.toLowerCase().includes("instruction") ||
          h.toLowerCase().includes("question")
      ),
      outputField: headers.find(
        (h) =>
          h.toLowerCase().includes("output") ||
          h.toLowerCase().includes("response") ||
          h.toLowerCase().includes("answer") ||
          h.toLowerCase().includes("completion")
      ),
    };

    return {
      isValid: errors.length === 0,
      errors,
      stats: {
        totalExamples: dataLines.length,
        averageLength: Math.round(
          lengths.reduce((a, b) => a + b, 0) / lengths.length
        ),
        minLength: Math.min(...lengths),
        maxLength: Math.max(...lengths),
      },
      schema,
    };
  }

  private static async validatePlainText(
    content: string
  ): Promise<DatasetValidation> {
    const errors: string[] = [];
    const lines = content.trim().split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      errors.push("Text file is empty");
      return { isValid: false, errors };
    }

    const lengths = lines.map((line) => line.length);

    return {
      isValid: true,
      errors: [],
      stats: {
        totalExamples: lines.length,
        averageLength: Math.round(
          lengths.reduce((a, b) => a + b, 0) / lengths.length
        ),
        minLength: Math.min(...lengths),
        maxLength: Math.max(...lengths),
      },
      schema: {
        format: "txt",
        columns: ["text"],
      },
    };
  }
}
