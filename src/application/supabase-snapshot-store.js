import { AuditLog } from "./audit.js";

function snapshotError(code, cause) {
  const error = new Error(code, { cause });
  error.code = code;
  return error;
}

function createRestClient(url, serviceRoleKey, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("SUPABASE_FETCH_REQUIRED");
  const baseUrl = new URL(url);
  if (!/^https?:$/.test(baseUrl.protocol)) throw new TypeError("SUPABASE_URL_INVALID");
  const restUrl = new URL("/rest/v1/", baseUrl).toString();
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const tableName = (table) => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new TypeError("SUPABASE_TABLE_INVALID");
    return table;
  };
  const responseBody = async (response) => {
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const error = new Error(`SUPABASE_HTTP_${response.status}`);
      error.code = `SUPABASE_HTTP_${response.status}`;
      return { data: null, error };
    }
    return { data, error: null };
  };
  return {
    from(table) {
      const safeTable = tableName(table);
      return {
        select(columns) {
          if (columns !== "snapshot") throw new TypeError("SUPABASE_SELECT_INVALID");
          return {
            eq(column, value) {
              if (column !== "snapshot_key") throw new TypeError("SUPABASE_FILTER_INVALID");
              return {
                async maybeSingle() {
                  const query = new URLSearchParams({ [column]: `eq.${value}` });
                  const response = await fetchImpl(`${restUrl}${safeTable}?${query}`, { headers: { ...headers, accept: "application/json" } });
                  const result = await responseBody(response);
                  if (result.error) return result;
                  if (!Array.isArray(result.data) || result.data.length === 0) return { data: null, error: null };
                  if (result.data.length > 1) {
                    const error = new Error("SUPABASE_MULTIPLE_ROWS");
                    error.code = "SUPABASE_MULTIPLE_ROWS";
                    return { data: null, error };
                  }
                  return { data: result.data[0], error: null };
                },
              };
            },
          };
        },
        async upsert(payload) {
          const response = await fetchImpl(`${restUrl}${safeTable}`, {
            method: "POST",
            headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(payload),
          });
          return responseBody(response);
        },
      };
    },
  };
}

export class SupabaseSnapshotStore {
  constructor({
    url = process.env.SUPABASE_URL,
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    snapshotKey = process.env.SUPABASE_SNAPSHOT_KEY || "stock-research-sandbox",
    client = null,
    fetchImpl = globalThis.fetch,
    table = "sandbox_snapshots",
  } = {}) {
    this.url = url;
    this.kind = "supabase-sandbox";
    this.serviceRoleKey = serviceRoleKey;
    this.snapshotKey = snapshotKey;
    this.table = table;
    // ASVS V2.2/V4.1: use the service-role key only in this server-side REST client.
    this.client = client || (url && serviceRoleKey ? createRestClient(url, serviceRoleKey, fetchImpl) : null);
    this.writeChain = Promise.resolve();
  }

  get enabled() {
    return Boolean(this.client);
  }

  async load(store, { auditLog = null } = {}) {
    if (!this.enabled) return { loaded: false, reason: "DISABLED" };
    try {
      // ASVS V2.2/V4.1: constrain the lookup to the server-owned snapshot key.
      const { data, error } = await this.client
        .from(this.table)
        .select("snapshot")
        .eq("snapshot_key", this.snapshotKey)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { loaded: false, reason: "NOT_FOUND" };
      const snapshot = typeof data.snapshot === "string" ? JSON.parse(data.snapshot) : data.snapshot;
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
      const snapshot = { ...store.snapshot(), ...(auditLog ? { auditEvents: auditLog.snapshot() } : {}) };
      const { error } = await this.client.from(this.table).upsert({
        snapshot_key: this.snapshotKey,
        snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: "snapshot_key" });
      if (error) throw error;
    } catch (cause) {
      throw snapshotError("SNAPSHOT_SAVE_FAILED", cause);
    }
    return { saved: true, reason: "SAVED" };
  }
}
