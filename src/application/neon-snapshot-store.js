import { neon as createNeonClient } from "@neondatabase/serverless";
import { AuditLog } from "./audit.js";

const SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sandbox_snapshots (
    snapshot_key text PRIMARY KEY,
    snapshot jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

function snapshotError(code, cause) {
  const error = new Error(code, { cause });
  error.code = code;
  return error;
}

export class NeonSnapshotStore {
  constructor({ connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, snapshotKey = process.env.NEON_SNAPSHOT_KEY || "stock-research-sandbox", sql = null } = {}) {
    this.connectionString = connectionString;
    this.kind = "neon-sandbox";
    this.snapshotKey = snapshotKey;
    this.sql = sql || (connectionString ? createNeonClient(connectionString) : null);
    this.schemaReady = null;
    this.writeChain = Promise.resolve();
  }

  get enabled() {
    return Boolean(this.sql);
  }

  async ensureSchema() {
    if (!this.enabled) return;
    if (!this.schemaReady) {
      this.schemaReady = this.sql.query(SNAPSHOT_TABLE_SQL).catch((cause) => {
        this.schemaReady = null;
        throw cause;
      });
    }
    await this.schemaReady;
  }

  async load(store, { auditLog = null } = {}) {
    if (!this.enabled) return { loaded: false, reason: "DISABLED" };
    try {
      await this.ensureSchema();
      const rows = await this.sql`SELECT snapshot FROM sandbox_snapshots WHERE snapshot_key = ${this.snapshotKey}`;
      if (!rows.length) return { loaded: false, reason: "NOT_FOUND" };
      const rawSnapshot = rows[0].snapshot;
      const snapshot = typeof rawSnapshot === "string" ? JSON.parse(rawSnapshot) : rawSnapshot;
      const pendingAudit = auditLog ? new AuditLog({ now: auditLog.now, maxEntries: auditLog.maxEntries }) : null;
      if (pendingAudit) pendingAudit.restore(snapshot.auditEvents ?? []);
      store.restore(snapshot);
      if (pendingAudit) auditLog.restore(pendingAudit.snapshot());
      return { loaded: true, reason: "LOADED" };
    } catch (cause) {
      throw snapshotError("SNAPSHOT_LOAD_FAILED", cause);
    }
  }

  async save(store, { auditLog = null } = {}) {
    if (!this.enabled) return { saved: false, reason: "DISABLED" };
    const operation = this.writeChain.then(
      () => this.saveOnce(store, { auditLog }),
      () => this.saveOnce(store, { auditLog }),
    );
    this.writeChain = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async saveOnce(store, { auditLog = null } = {}) {
    try {
      await this.ensureSchema();
      const snapshot = { ...store.snapshot(), ...(auditLog ? { auditEvents: auditLog.snapshot() } : {}) };
      await this.sql`
        INSERT INTO sandbox_snapshots (snapshot_key, snapshot, updated_at)
        VALUES (${this.snapshotKey}, ${JSON.stringify(snapshot)}::jsonb, now())
        ON CONFLICT (snapshot_key) DO UPDATE
        SET snapshot = EXCLUDED.snapshot, updated_at = EXCLUDED.updated_at
      `;
    } catch (cause) {
      throw snapshotError("SNAPSHOT_SAVE_FAILED", cause);
    }
    return { saved: true, reason: "SAVED" };
  }
}
