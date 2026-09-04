import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL?.trim();

const globalForDb = globalThis as typeof globalThis & {
  __lyricforgePool?: Pool;
};

export const hasDatabase = Boolean(databaseUrl && databaseUrl.length > 0);

export const pool = hasDatabase && databaseUrl
  ? (globalForDb.__lyricforgePool ??
    new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 1500,
    }))
  : null;

if (pool) {
  pool.on("error", (err) => {
    console.warn("Postgres connection pool error:", err.message);
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__lyricforgePool = pool;
  }
}

export const db: NodePgDatabase<typeof schema> | null = pool ? drizzle(pool, { schema }) : null;

export { schema };
