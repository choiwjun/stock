import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { AuditLog } from "./audit.js";

export class FileSnapshotStore {
  constructor({ path = null } = {}) {
    this.path = typeof path === "string" && path.length > 0 ? path : null;
    this.kind = "file-sandbox";
    this.writeChain = Promise.resolve();
  }

  get enabled() {
    return Boolean(this.path);
  }

  async load(store, { auditLog = null } = {}) {
    if (!this.path) return { loaded: false, reason: "DISABLED" };
    let raw;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (cause) {
      if (cause.code === "ENOENT") return { loaded: false, reason: "NOT_FOUND" };
      const error = new Error("SNAPSHOT_LOAD_FAILED", { cause });
      error.code = "SNAPSHOT_LOAD_FAILED";
      throw error;
    }

    try {
      const snapshot = JSON.parse(raw);
      const pendingAudit = auditLog ? new AuditLog({ now: auditLog.now, maxEntries: auditLog.maxEntries }) : null;
      if (pendingAudit) pendingAudit.restore(snapshot.auditEvents ?? []);
      store.restore(snapshot);
      if (pendingAudit) auditLog.restore(pendingAudit.snapshot());
    } catch (cause) {
      const error = new Error("SNAPSHOT_LOAD_FAILED", { cause });
      error.code = "SNAPSHOT_LOAD_FAILED";
      throw error;
    }
    return { loaded: true, reason: "LOADED" };
  }

  async save(store, { auditLog = null } = {}) {
    if (!this.path) return { saved: false, reason: "DISABLED" };
    const operation = this.writeChain.then(
      () => this.saveOnce(store, { auditLog }),
      () => this.saveOnce(store, { auditLog }),
    );
    this.writeChain = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async saveOnce(store, { auditLog = null } = {}) {
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    let fileHandle = null;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const snapshot = { ...store.snapshot(), ...(auditLog ? { auditEvents: auditLog.snapshot() } : {}) };
      fileHandle = await open(temporaryPath, "w", 0o600);
      await fileHandle.writeFile(`${JSON.stringify(snapshot)}\n`, "utf8");
      await fileHandle.sync();
      await fileHandle.close();
      fileHandle = null;
      await rename(temporaryPath, this.path);
      await this.syncDirectory();
    } catch (cause) {
      await fileHandle?.close().catch(() => {});
      await rm(temporaryPath, { force: true }).catch(() => {});
      const error = new Error("SNAPSHOT_SAVE_FAILED", { cause });
      error.code = "SNAPSHOT_SAVE_FAILED";
      throw error;
    }
    return { saved: true, reason: "SAVED" };
  }

  async syncDirectory() {
    let directoryHandle = null;
    try {
      directoryHandle = await open(dirname(this.path), "r");
      await directoryHandle.sync();
    } catch (cause) {
      if (!new Set(["EBADF", "EINVAL", "EISDIR", "EPERM"]).has(cause.code)) throw cause;
    } finally {
      await directoryHandle?.close().catch(() => {});
    }
  }
}
