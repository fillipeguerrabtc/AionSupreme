// server/agent/planner_multi.ts
import { route } from "./router";
import { getAgentById } from "./runtime";

function fuse(outputs: any[]) {
  if (!outputs.length) return { text: "No output." };
  const withCitations = outputs.filter(o => o.citations && o.citations.length);
  return (withCitations[0] ?? outputs[0]);
}

export async function planAndExecute(input: any, ctx: any) {
  const choices = await route(input.query, ctx.tenantId, ctx.budgetUSD);
  const results = [];
  for (const c of choices) {
    const agent = await getAgentById(c.agentId);
    results.push(await agent.run(input, ctx));
  }
  return fuse(results);
}
