// server/seedAgents.ts
import fs from "fs";
import path from "path";
import { db } from "./db";
import { agents as agentsTable } from "../shared/schema_agents";

async function seedAgents(tenantId: string) {
  const seedPath = path.join(__dirname, "seeds", "agents.seed.json");
  const raw = fs.readFileSync(seedPath, "utf-8");
  const agents = JSON.parse(raw);
  for (const a of agents) {
    await db.insert(agentsTable).values({ ...a, tenantId });
  }
  console.log(`[seed] inserted ${agents.length} agents for tenant ${tenantId}`);
}

const tenantId = process.env.SEED_TENANT_ID || "00000000-0000-0000-0000-000000000001";
seedAgents(tenantId).then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
