import type { AgentObservation } from "../react-engine";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export async function execSandbox(input: { code: string; language?: string; timeout?: number }): Promise<AgentObservation> {
  const language = input.language || "python";
  const timeout = input.timeout || 5000;
  
  if (language !== "python") {
    return {
      observation: `Language '${language}' not supported. Only Python is supported.`,
      success: false,
    };
  }
  
  try {
    // Write code to temp file
    const tempFile = path.join("/tmp", `exec_${Date.now()}.py`);
    await fs.writeFile(tempFile, input.code);
    
    // Execute with timeout and resource limits
    const { stdout, stderr } = await execAsync(`python3 ${tempFile}`, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
    });
    
    // Cleanup
    await fs.unlink(tempFile).catch(() => {});
    
    const output = stdout || stderr;
    return {
      observation: output || "Code executed successfully (no output)",
      success: true,
      metadata: { language, executionTime: timeout },
    };
  } catch (error: any) {
    return {
      observation: `Execution failed: ${error.message}`,
      success: false,
      errorMessage: error.message,
    };
  }
}
