import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  console.error("SUPABASE_DATABASE_URL is required");
  process.exit(1);
}

const migrationsDir = process.env.MIGRATIONS_DIR || new URL("../db/migrations", import.meta.url).pathname;
const sql = postgres(connectionString, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Supabase migration skipped: ${file}`);
      continue;
    }
    const migration = await readFile(join(migrationsDir, file), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
    console.log(`Supabase migration applied: ${file}`);
  }

  const tables = await sql`
    SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `;
  console.log(`Supabase migration state verified: ${tables[0].count} public tables`);
} catch (cause) {
  console.error(`Supabase migration failed: ${cause.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
