// server/seedAgents.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db";
import { agents as agentsTable } from "../shared/schema";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedAgents() {
  // Load main agents
  const seedPath = path.join(__dirname, "seeds", "agents.seed.json");
  const raw = fs.readFileSync(seedPath, "utf-8");
  const mainAgents = JSON.parse(raw);
  
  // Load curator agents
  const curatorPath = path.join(__dirname, "seeds", "curators.seed.json");
  const curatorRaw = fs.readFileSync(curatorPath, "utf-8");
  const curatorAgents = JSON.parse(curatorRaw);
  
  // Combine all agents
  const agents = [...mainAgents, ...curatorAgents];
  
  console.log(`[seed] Loading ${agents.length} agents...`);
  
  for (const a of agents) {
    // Check if agent already exists (by slug)
    const existing = await db.select().from(agentsTable)
      .where(eq(agentsTable.slug, a.slug))
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`[seed] Agent "${a.name}" (${a.slug}) already exists, skipping...`);
      continue;
    }
    
    await db.insert(agentsTable).values(a);
    console.log(`[seed] ✓ Created agent: ${a.name} (${a.slug})`);
  }
  
  console.log(`[seed] ✓ Agent seeding completed`);
}

seedAgents().then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
