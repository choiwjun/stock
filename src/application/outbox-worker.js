export class OutboxWorker {
  constructor({ queue, publish, consumer = "outbox-worker", onError = () => {}, now = () => Date.now() } = {}) {
    if (!queue || typeof queue.claimDue !== "function" || typeof queue.markPublished !== "function" || typeof queue.markFailed !== "function") throw new TypeError("OUTBOX_QUEUE_REQUIRED");
    if (typeof publish !== "function") throw new TypeError("OUTBOX_PUBLISHER_REQUIRED");
    this.queue = queue;
    this.publish = publish;
    this.consumer = consumer;
    this.onError = onError;
    this.now = now;
    this.timer = null;
    this.active = false;
    this.inFlight = 0;
    this.idleWaiters = [];
    this.lastRunAt = null;
    this.lastSuccessAt = null;
    this.lastErrorAt = null;
    this.lastErrorCode = null;
    this.consecutiveFailures = 0;
  }

  async runOnce(limit = 50) {
    this.inFlight += 1;
    try {
      const result = await this.processOnce(limit);
      const completedAt = this.now();
      this.lastRunAt = completedAt;
      const failed = result.outcomes.find((outcome) => outcome.status !== "PUBLISHED");
      if (failed) {
        this.lastErrorAt = completedAt;
        this.lastErrorCode = failed.errorCode || "DELIVERY_FAILED";
        this.consecutiveFailures += 1;
      } else {
        this.lastSuccessAt = completedAt;
        this.lastErrorCode = null;
        this.consecutiveFailures = 0;
      }
      return result;
    } catch (cause) {
      const failedAt = this.now();
      this.lastRunAt = failedAt;
      this.lastErrorAt = failedAt;
      this.lastErrorCode = cause?.code || "WORKER_ERROR";
      this.consecutiveFailures += 1;
      throw cause;
    } finally {
      this.inFlight -= 1;
      if (this.inFlight === 0) {
        const waiters = this.idleWaiters.splice(0);
        for (const resolve of waiters) resolve();
      }
    }
  }

  async processOnce(limit = 50) {
    const claimed = this.queue.claimDue(limit, this.consumer);
    const outcomes = [];
    for (const record of claimed) {
      try {
        const payload = record.payload;
        const cursor = record.streamKey && Number.isSafeInteger(payload?.epoch) && payload.epoch >= 1 && Number.isSafeInteger(payload?.sequence) && payload.sequence >= 0
          ? { streamKey: record.streamKey, epoch: payload.epoch, sequence: payload.sequence }
          : null;
        const checkpointState = cursor && typeof this.queue.checkpointDecision === "function"
          ? this.queue.checkpointDecision(this.consumer, cursor)
          : null;
        if (checkpointState === "BLOCKED" || checkpointState === "INVALID") {
          const error = new Error("CHECKPOINT_NOT_CONTIGUOUS");
          error.code = "CHECKPOINT_NOT_CONTIGUOUS";
          throw error;
        }
        if (checkpointState !== "ALREADY") await this.publish(record);
        const checkpointAdvanced = cursor && checkpointState !== "ALREADY" ? this.queue.advanceCheckpoint(this.consumer, cursor) : null;
        if (cursor && checkpointState !== "ALREADY" && !checkpointAdvanced) {
          const current = this.queue.checkpoint(this.consumer, cursor.streamKey);
          if (!current || current.epoch !== cursor.epoch || current.sequence !== cursor.sequence) {
            const error = new Error("CHECKPOINT_NOT_CONTIGUOUS");
            error.code = "CHECKPOINT_NOT_CONTIGUOUS";
            throw error;
          }
        }
        this.queue.markPublished(record.eventId);
        outcomes.push({ eventId: record.eventId, status: "PUBLISHED", checkpointAdvanced });
      } catch (cause) {
        const failed = this.queue.markFailed(record.eventId, cause?.message || cause || "PUBLISH_FAILED");
        try {
          this.onError(cause, record, failed);
        } catch {
          // Error observers must not stop retry processing.
        }
        outcomes.push({ eventId: record.eventId, status: failed?.status || "FAILED", attempt: failed?.attempt || 0, errorCode: cause?.code || "PUBLISH_FAILED" });
      }
    }
    return { claimed: claimed.length, published: outcomes.filter((item) => item.status === "PUBLISHED").length, failed: outcomes.filter((item) => item.status !== "PUBLISHED").length, outcomes };
  }

  start(intervalMs = 1_000, limit = 50) {
    if (this.active) return false;
    this.active = true;
    const schedule = () => {
      if (!this.active) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.runOnce(limit)
          .catch((cause) => {
            try {
              this.onError(cause, null, null);
            } catch {
              // Error observers must not stop the background schedule.
            }
          })
          .finally(schedule);
      }, intervalMs);
    };
    schedule();
    return true;
  }

  stop() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  health() {
    const timestamp = (value) => value === null ? null : new Date(value).toISOString();
    return {
      active: this.active,
      inFlight: this.inFlight,
      lastRunAt: timestamp(this.lastRunAt),
      lastSuccessAt: timestamp(this.lastSuccessAt),
      lastErrorAt: timestamp(this.lastErrorAt),
      lastErrorCode: this.lastErrorCode,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  waitForIdle() {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }
}
