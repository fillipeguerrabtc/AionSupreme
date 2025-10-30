import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

// Configure PostgreSQL session to use Brasília timezone
pool.on('connect', async (client) => {
  try {
    await client.query("SET timezone = 'America/Sao_Paulo'");
  } catch (err) {
    console.error('[Database] Failed to set timezone:', err);
  }
});

export const db = drizzle({ client: pool, schema });
