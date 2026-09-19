import { FileSnapshotStore } from "./snapshot-store.js";
import { NeonSnapshotStore } from "./neon-snapshot-store.js";

export async function createSnapshotStore({ env = process.env, filePath = env.STORE_SNAPSHOT_PATH, supabaseClient = null } = {}) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { SupabaseSnapshotStore } = await import("./supabase-snapshot-store.js");
    return new SupabaseSnapshotStore({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      snapshotKey: env.SUPABASE_SNAPSHOT_KEY,
      client: supabaseClient,
    });
  }
  if (env.NEON_DATABASE_URL || env.DATABASE_URL) {
    return new NeonSnapshotStore({ connectionString: env.NEON_DATABASE_URL || env.DATABASE_URL });
  }
  return new FileSnapshotStore({ path: filePath });
}
