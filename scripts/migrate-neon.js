import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationsDir = process.env.MIGRATIONS_DIR || new URL("../db/migrations", import.meta.url).pathname;
const client = new Client(connectionString);

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((row) => row.version));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Neon migration skipped: ${file}`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Neon migration applied: ${file}`);
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => {});
      throw cause;
    }
  }

  const tables = await client.query(`
    SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  console.log(`Neon migration state verified: ${tables.rows[0].count} public tables`);
} catch (cause) {
  console.error(`Neon migration failed: ${cause.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
