-- server/migrations/001_init_agents.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  slug varchar(120) NOT NULL,
  type varchar(32) NOT NULL DEFAULT 'specialist',
  description text,
  system_prompt text,
  inference_config jsonb,
  policy jsonb,
  rag_namespaces jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_slug ON agents(tenant_id, slug);

CREATE TABLE IF NOT EXISTS tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  slug varchar(120) NOT NULL,
  type varchar(64) NOT NULL,
  config jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tools (
  agent_id uuid NOT NULL,
  tool_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id varchar NOT NULL,
  user_query text NOT NULL,
  router_decision jsonb,
  agents_called jsonb,
  sources jsonb,
  total_cost_usd real,
  total_latency_ms integer,
  created_at timestamp NOT NULL DEFAULT now()
);
