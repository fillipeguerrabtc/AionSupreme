// shared/schema_agents.ts
import { pgTable, text, integer, timestamp, boolean, jsonb, real, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  type: varchar("type", { length: 32 }).notNull().default("specialist"), // specialist|generalist|router-only
  description: text("description"),
  systemPrompt: text("system_prompt"),
  inferenceConfig: jsonb("inference_config"), // { model, temperature, top_p, max_tokens, adapterIds[] }
  policy: jsonb("policy"), // { allowedTools[], allowedNamespaces[], perRequestBudgetUSD, maxAgentsFanOut, fallbackHuman, escalationRules }
  ragNamespaces: jsonb("rag_namespaces"), // string[]
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tools = pgTable("tools", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(), // "whatsapp"|"crm"|"catalog"|"payments"|"calendar"|"web_search"|...
  config: jsonb("config"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agentTools = pgTable("agent_tools", {
  agentId: varchar("agent_id").notNull(),
  toolId: varchar("tool_id").notNull(),
});

export const traces = pgTable("traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  sessionId: varchar("session_id").notNull(),
  userQuery: text("user_query").notNull(),
  routerDecision: jsonb("router_decision"),
  agentsCalled: jsonb("agents_called"), // [{agentId, costUSD, tokens, latencyMs}]
  sources: jsonb("sources"),
  totalCostUSD: real("total_cost_usd"),
  totalLatencyMs: integer("total_latency_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
