// server/agent/router.ts
import { loadAgents } from "./registry";

type RouterChoice = { agentId: string; score: number; reason?: string };

function softmax(xs: number[]) {
  const m = Math.max(...xs);
  const exps = xs.map(x => Math.exp(x - m));
  const sum = exps.reduce((a,b)=>a+b,0);
  return exps.map(e => e / sum);
}

function topP(choices: RouterChoice[], p=0.9, maxFanOut=2) {
  const scores = choices.map(c => c.score);
  const probs = softmax(scores);
  const z = choices.map((c,i)=>({ ...c, prob: probs[i]})).sort((a,b)=>b.prob-a.prob);
  let acc = 0, out: RouterChoice[] = [];
  for (const c of z) {
    if (out.length >= maxFanOut) break;
    out.push({ agentId: c.agentId, score: c.score, reason: c.reason });
    acc += c.prob;
    if (acc >= p) break;
  }
  return out;
}

// TODO: plug your classifier; here a simple placeholder
function scoreAgentForIntent(_agent: any, _intents: any) {
  return Math.random()*0.5 + 0.5;
}

export async function route(query: string, tenantId: number, budgetUSD: number): Promise<RouterChoice[]> {
  const pool = await loadAgents(tenantId);
  const intents = {}; // TODO: integrate with intent classifier
  const scored = pool.map(a => ({ agentId: a.id, score: scoreAgentForIntent(a, intents), reason: "domain-match + past-success" }))
                     .sort((x,y)=>y.score-x.score);
  return topP(scored, 0.9, 2);
}
