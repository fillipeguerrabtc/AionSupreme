/**
 * Enforcement Pipeline - System Prompt Composer & Output Moderator
 * As per PDFs: Externalized policy enforcement with ∂Pr[violation]/∂θ=0
 */
import { storage } from "../storage";
import { llmClient } from "../model/llm-client";
import crypto from "crypto";
import type { Policy } from "@shared/schema";

export class EnforcementPipeline {
  async composeSystemPrompt(policy: Policy): Promise<string> {
    let prompt = policy.systemPrompt || "You are AION, an advanced AI assistant.";
    
    // Add personality traits
    prompt += `\n\nPersonality:\n- Humor: ${policy.humor}\n- Tone: ${policy.tone}`;
    prompt += `\n- Verbosity: ${policy.behavior.verbosity}\n- Creativity: ${policy.behavior.creativity}`;
    
    // Add active rules
    const activeRules = Object.entries(policy.rules).filter(([_, active]) => active);
    if (activeRules.length > 0) {
      prompt += `\n\nContent Restrictions (ENFORCE STRICTLY):\n`;
      prompt += activeRules.map(([rule]) => `- Avoid: ${rule.replace(/_/g, " ")}`).join("\n");
    }
    
    return prompt;
  }

  async moderateOutput(content: string, policy: Policy, tenantId: number): Promise<string> {
    const activeRules = Object.entries(policy.rules).filter(([_, active]) => active);
    
    // If no rules active, return content as-is (system born free)
    if (activeRules.length === 0) return content;
    
    // Check for violations
    const hasViolation = await this.checkViolations(content, activeRules, tenantId);
    
    if (!hasViolation) return content;
    
    // Handle based on onBlock action
    if (policy.onBlock === "refuse") {
      return "[Content blocked by policy]";
    } else if (policy.onBlock === "redact") {
      return "[Content redacted]";
    } else if (policy.onBlock === "rewrite") {
      return await this.rewriteContent(content, tenantId);
    }
    
    return content;
  }

  private async checkViolations(content: string, rules: [string, boolean][], tenantId: number): Promise<boolean> {
    const ruleNames = rules.map(([name]) => name).join(", ");
    const prompt = `Check if the following content violates any of these rules: ${ruleNames}\n\nContent: ${content}\n\nRespond with only YES or NO:`;
    
    const result = await llmClient.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      tenantId,
      model: "gpt-3.5-turbo",
      temperature: 0,
      maxTokens: 5,
    });
    
    return result.content.trim().toUpperCase() === "YES";
  }

  private async rewriteContent(content: string, tenantId: number): Promise<string> {
    const prompt = `Rewrite the following content to be appropriate and policy-compliant:\n\n${content}`;
    const result = await llmClient.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      tenantId,
      model: "gpt-3.5-turbo",
      temperature: 0.7,
    });
    return result.content;
  }

  async createAuditLog(tenantId: number, eventType: string, data: Record<string, any>, policy?: Policy): Promise<void> {
    const dataHash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
    
    await storage.createAuditLog({
      tenantId,
      eventType,
      data,
      dataHash,
      policySnapshot: policy,
      actor: "system",
    });
  }
}

export const enforcementPipeline = new EnforcementPipeline();
