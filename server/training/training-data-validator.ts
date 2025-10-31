/**
 * Training Data Validator with Auto-Correction
 * Validates and automatically fixes common issues in training data (instruction/output format)
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  corrected?: {
    instruction: string;
    output: string;
  };
  original: {
    instruction: string;
    output: string;
  };
  autoCorrections: string[];
}

export class TrainingDataValidator {
  private static MIN_INSTRUCTION_LENGTH = 5;
  private static MIN_OUTPUT_LENGTH = 10;
  private static MAX_INSTRUCTION_LENGTH = 5000;
  private static MAX_OUTPUT_LENGTH = 50000;

  /**
   * Validates training data with automatic correction
   */
  static validate(instruction: string, output: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      original: { instruction, output },
      autoCorrections: [],
    };

    // Auto-trim whitespace
    let correctedInstruction = instruction?.trim() || "";
    let correctedOutput = output?.trim() || "";
    let correctionsMade = false;

    if (instruction !== correctedInstruction || output !== correctedOutput) {
      result.autoCorrections.push("Removed extra whitespace");
      correctionsMade = true;
    }

    // 1. Empty field validation
    if (!correctedInstruction) {
      result.errors.push("Instruction cannot be empty");
      result.isValid = false;
    }

    if (!correctedOutput) {
      result.errors.push("Output cannot be empty");
      result.isValid = false;
    }

    // Return early if empty
    if (!result.isValid) {
      return result;
    }

    // 2. Length validation
    if (correctedInstruction.length < this.MIN_INSTRUCTION_LENGTH) {
      result.warnings.push(
        `Instruction is very short (${correctedInstruction.length} chars, recommended: ${this.MIN_INSTRUCTION_LENGTH}+)`
      );
    }

    if (correctedOutput.length < this.MIN_OUTPUT_LENGTH) {
      result.warnings.push(
        `Output is very short (${correctedOutput.length} chars, recommended: ${this.MIN_OUTPUT_LENGTH}+)`
      );
    }

    if (correctedInstruction.length > this.MAX_INSTRUCTION_LENGTH) {
      result.errors.push(
        `Instruction too long (${correctedInstruction.length} chars, max: ${this.MAX_INSTRUCTION_LENGTH})`
      );
      result.isValid = false;
    }

    if (correctedOutput.length > this.MAX_OUTPUT_LENGTH) {
      result.errors.push(
        `Output too long (${correctedOutput.length} chars, max: ${this.MAX_OUTPUT_LENGTH})`
      );
      result.isValid = false;
    }

    // 3. Auto-correct common formatting issues
    
    // Remove multiple consecutive spaces
    const instructionNoMultiSpace = correctedInstruction.replace(/\s+/g, " ");
    const outputNoMultiSpace = correctedOutput.replace(/\s+/g, " ");

    if (correctedInstruction !== instructionNoMultiSpace) {
      correctedInstruction = instructionNoMultiSpace;
      result.autoCorrections.push("Fixed multiple consecutive spaces in instruction");
      correctionsMade = true;
    }

    if (correctedOutput !== outputNoMultiSpace) {
      correctedOutput = outputNoMultiSpace;
      result.autoCorrections.push("Fixed multiple consecutive spaces in output");
      correctionsMade = true;
    }

    // 4. Detect and warn about common issues
    
    // Check if instruction looks like a question
    const hasQuestionMark = correctedInstruction.includes("?");
    const questionWords = ["what", "why", "how", "when", "where", "who", "which", "is", "are", "can", "should"];
    const startsWithQuestion = questionWords.some((word) =>
      correctedInstruction.toLowerCase().startsWith(word + " ")
    );

    if (!hasQuestionMark && !startsWithQuestion && correctedInstruction.length < 100) {
      result.warnings.push(
        "Instruction doesn't appear to be a question or command. Consider rephrasing for clarity."
      );
    }

    // Check if output is just a copy of instruction (common mistake)
    if (correctedInstruction === correctedOutput) {
      result.errors.push("Output cannot be identical to instruction");
      result.isValid = false;
    }

    // Check for placeholder text
    const placeholders = ["lorem ipsum", "placeholder", "example", "todo", "tbd", "xxx", "test test"];
    const instructionLower = correctedInstruction.toLowerCase();
    const outputLower = correctedOutput.toLowerCase();

    placeholders.forEach((placeholder) => {
      if (instructionLower.includes(placeholder)) {
        result.warnings.push(`Instruction contains placeholder text: "${placeholder}"`);
      }
      if (outputLower.includes(placeholder)) {
        result.warnings.push(`Output contains placeholder text: "${placeholder}"`);
      }
    });

    // 5. JSON validation if output looks like JSON
    if (correctedOutput.trim().startsWith("{") || correctedOutput.trim().startsWith("[")) {
      try {
        JSON.parse(correctedOutput);
        // Valid JSON - no correction needed
      } catch (e) {
        // Try to auto-fix common JSON issues
        try {
          // Remove trailing commas
          const fixedJson = correctedOutput.replace(/,(\s*[}\]])/g, "$1");
          JSON.parse(fixedJson);
          
          correctedOutput = fixedJson;
          result.autoCorrections.push("Fixed malformed JSON (removed trailing commas)");
          correctionsMade = true;
        } catch {
          result.warnings.push("Output appears to be JSON but has syntax errors. Consider validating JSON structure.");
        }
      }
    }

    // 6. Check for code blocks and formatting
    const hasCodeBlock = correctedOutput.includes("```");
    const hasIndentation = correctedOutput.split("\n").some(line => line.startsWith("  ") || line.startsWith("\t"));

    if (hasCodeBlock || hasIndentation) {
      result.warnings.push("Output contains code formatting. Ensure proper formatting for model training.");
    }

    // Add corrected version if changes were made
    if (correctionsMade) {
      result.corrected = {
        instruction: correctedInstruction,
        output: correctedOutput,
      };
    }

    return result;
  }

  /**
   * Validates JSONL format for dataset files
   */
  static validateJSONL(content: string): {
    isValid: boolean;
    errors: string[];
    fixedContent?: string;
    autoCorrections: string[];
  } {
    const errors: string[] = [];
    const autoCorrections: string[] = [];
    const lines = content.trim().split("\n");
    const fixedLines: string[] = [];
    let hadErrors = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) {
        continue;
      }

      try {
        const obj = JSON.parse(line);
        
        // Validate structure
        if (!obj.instruction && !obj.prompt && !obj.input) {
          errors.push(`Line ${i + 1}: Missing instruction/prompt/input field`);
          hadErrors = true;
          continue;
        }

        if (!obj.output && !obj.response && !obj.completion) {
          errors.push(`Line ${i + 1}: Missing output/response/completion field`);
          hadErrors = true;
          continue;
        }

        // Normalize to standard format
        const normalized = {
          instruction: obj.instruction || obj.prompt || obj.input,
          output: obj.output || obj.response || obj.completion,
        };

        // Validate normalized data
        const validation = this.validate(normalized.instruction, normalized.output);
        
        if (!validation.isValid) {
          errors.push(`Line ${i + 1}: ${validation.errors.join(", ")}`);
          hadErrors = true;
          continue;
        }

        // Use corrected version if available
        const finalData = validation.corrected || normalized;
        fixedLines.push(JSON.stringify(finalData));

        if (validation.autoCorrections.length > 0) {
          autoCorrections.push(`Line ${i + 1}: ${validation.autoCorrections.join(", ")}`);
        }

      } catch (e) {
        errors.push(`Line ${i + 1}: Invalid JSON - ${e instanceof Error ? e.message : String(e)}`);
        hadErrors = true;
      }
    }

    return {
      isValid: !hadErrors && fixedLines.length > 0,
      errors,
      fixedContent: hadErrors ? undefined : fixedLines.join("\n"),
      autoCorrections,
    };
  }
}
