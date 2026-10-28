import { getDb } from "../client";

export interface Guild {
  id: string;
  name: string;
  created_at: Date;
}

export async function upsertGuild(id: string, name: string): Promise<Guild> {
  const sql = getDb();
  const [guild] = await sql<Guild[]>`
    INSERT INTO guilds (id, name)
    VALUES (${id}, ${name})
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id, name, created_at
  `;
  if (!guild) {
    throw new Error(`Failed to upsert guild ${id}`);
  }
  return guild;
}

export async function getGuild(id: string): Promise<Guild | null> {
  const sql = getDb();
  const [guild] = await sql<Guild[]>`
    SELECT id, name, created_at
    FROM guilds
    WHERE id = ${id}
  `;
  return guild ?? null;
}
