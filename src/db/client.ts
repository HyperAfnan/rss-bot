import postgres from "postgres";
import { getConfig } from "../config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let sqlInstance: postgres.Sql | null = null;

export function getDb(): postgres.Sql {
  if (!sqlInstance) {
    const config = getConfig();
    const isProduction = config.NODE_ENV === "production";
    
    // Automatically configure SSL for production or remote URLs (like Supabase)
    const isRemote = config.DATABASE_URL.includes("supabase.co") ||
                     config.DATABASE_URL.includes("render.com") ||
                     config.DATABASE_URL.includes("pooler.supabase.com");

    const sslOption = isProduction || isRemote ? { rejectUnauthorized: false } : undefined;

    sqlInstance = postgres(config.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: sslOption,
      onnotice: () => {}, // Suppress notice spam
    });
  }
  return sqlInstance;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error("[Database] Connection check failed:", error);
    return false;
  }
}

export async function initDatabase(): Promise<void> {
  const sql = getDb();
  console.log("[Database] Initializing database schema...");
  
  // Read schema.sql relative to current file
  const schemaPath = join(import.meta.dir, "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");
  
  await sql.unsafe(schemaSql);
  console.log("[Database] Database schema initialized successfully.");
}

export async function closeDatabase(): Promise<void> {
  if (sqlInstance) {
    console.log("[Database] Closing database connections...");
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = null;
    console.log("[Database] Database connection closed.");
  }
}
