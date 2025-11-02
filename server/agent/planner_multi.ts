// server/agent/planner_multi.ts
import { route } from "./router";
import { getAgentById } from "./runtime";
import { queryMonitor } from "../services/query-monitor";

function fuse(outputs: any[]) {
  if (!outputs.length) return { text: "No output." };
  const withCitations = outputs.filter(o => o.citations && o.citations.length);
  return (withCitations[0] ?? outputs[0]);
}

export async function planAndExecute(input: any, ctx: any) {
  const choices = await route(input.query, ctx.budgetUSD);
  const results = [];
  for (const c of choices) {
    const agent = await getAgentById(c.agentId);
    const startTime = Date.now();
    try {
      const result = await agent.run(input, ctx);
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQuerySuccess(c.agentId, latency);
      results.push(result);
    } catch (error: any) {
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQueryError(c.agentId, error.name || "UnknownError", latency);
      console.error(`[Planner] Agent ${c.agentId} failed:`, error.message);
      // Continue with other agents instead of failing completely
    }
  }
  return fuse(results);
}
