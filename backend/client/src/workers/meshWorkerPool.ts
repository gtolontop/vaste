// Simple worker pool for mesh workers. Creates N workers and routes jobs by jobId.
type MeshJob = {
  jobId: string;
  chunkKey: string;
  cx: number;
  cy: number;
  cz: number;
  // new: use typed arrays for sparse block data to avoid JS allocations
  // indices: local chunk indices (0..4095) as Uint16Array
  // types: corresponding block types as Uint16Array
  indices?: Uint16Array;
  types?: Uint16Array;
  atlasMeta: any | null;
};

type MeshResult = {
  jobId: string;
  chunkKey: string;
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  indices: ArrayBuffer;
};

const DEFAULT_POOL_SIZE = (() => {
  try {
    const override = typeof localStorage !== "undefined" ? localStorage.getItem("vaste_mesh_pool_size") : null;
    if (override) {
      const n = parseInt(override, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch (e) {}
  return typeof navigator !== "undefined" && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency : 2;
})();

class MeshWorkerPool {
  private workers: Worker[] = [];
  private nextIdx = 0;
  private pending: Map<string, { resolve: (res: MeshResult) => void; reject: (e: any) => void }> = new Map();
  private queue: MeshJob[] = [];
  private queuedResolvers: Map<string, { resolve: (r: MeshResult) => void; reject: (e: any) => void }> = new Map();
  private maxQueue: number = 256;

  constructor(poolSize = DEFAULT_POOL_SIZE, maxQueue = 256) {
    this.maxQueue = maxQueue;
    for (let i = 0; i < poolSize; i++) this.workers.push(this.createWorker());
  }

  private createWorker() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const w = new Worker(new URL("../workers/meshWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== "meshResult") return;
      // meshWorker currently returns chunkKey not jobId; for compatibility we treat chunkKey as jobId when needed
      const jobId = (data as any).jobId || data.chunkKey;
      const cbPair = this.pending.get(jobId);
      if (cbPair) {
        try {
          cbPair.resolve({ jobId, chunkKey: data.chunkKey, positions: data.positions, normals: data.normals, uvs: data.uvs, indices: data.indices });
        } catch (e) {
          try {
            cbPair.reject(e);
          } catch (e2) {}
        } finally {
          this.pending.delete(jobId);
          // try to dispatch queued jobs now that a worker is free
          this.dispatchFromQueue();
        }
      }
    };
    w.onerror = (err) => {
      console.error("Mesh worker pool worker error", err);
    };
    return w;
  }

  postJob(job: MeshJob): Promise<MeshResult> {
    // If workers are idle, dispatch immediately; otherwise queue up to maxQueue
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueue) return reject(new Error("mesh queue full"));
      // attempt direct dispatch
      if (this.pending.size < this.workers.length) {
        const worker = this.workers[this.nextIdx];
        this.nextIdx = (this.nextIdx + 1) % this.workers.length;
        this.pending.set(job.jobId, { resolve, reject });
        // Build payload with typed-array buffers transferred when available
        const payload: any = { type: "meshChunk", chunkKey: job.jobId, cx: job.cx, cy: job.cy, cz: job.cz, atlasMeta: job.atlasMeta };
        const transfers: ArrayBuffer[] = [];
        if (job.indices) {
          payload.indices = job.indices;
          transfers.push(job.indices.buffer as ArrayBuffer);
        }
        if (job.types) {
          payload.types = job.types;
          transfers.push(job.types.buffer as ArrayBuffer);
        }
        try {
          worker.postMessage(payload, transfers);
        } catch (e) {
          this.pending.delete(job.jobId);
          reject(e);
        }
        return;
      }

      // otherwise queue
      this.queue.push(job);
      this.queuedResolvers.set(job.jobId, { resolve, reject });
    });
  }

  // cancel a queued job (or pending) by jobId
  cancelJob(jobId: string) {
    // remove from queue
    const qi = this.queue.findIndex((j) => j.jobId === jobId);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      const r = this.queuedResolvers.get(jobId);
      if (r) {
        try {
          r.reject(new Error("job cancelled"));
        } catch (e) {}
        this.queuedResolvers.delete(jobId);
      }
      return true;
    }
    // if pending, remove resolver and no-op (can't terminate worker mid-run without more complex control)
    if (this.pending.has(jobId)) {
      const pair = this.pending.get(jobId)!;
      try {
        pair.reject(new Error("job cancelled"));
      } catch (e) {}
      this.pending.delete(jobId);
      return true;
    }
    return false;
  }

  // attempt to dispatch queued jobs when workers become available
  private dispatchFromQueue() {
    while (this.queue.length > 0 && this.pending.size < this.workers.length) {
      const job = this.queue.shift()!;
      const resolver = this.queuedResolvers.get(job.jobId);
      if (!resolver) continue;
      this.queuedResolvers.delete(job.jobId);
      const worker = this.workers[this.nextIdx];
      this.nextIdx = (this.nextIdx + 1) % this.workers.length;
      this.pending.set(job.jobId, resolver);
      const payload: any = { type: "meshChunk", chunkKey: job.jobId, cx: job.cx, cy: job.cy, cz: job.cz, atlasMeta: job.atlasMeta };
      const transfers: ArrayBuffer[] = [];
      if (job.indices) {
        payload.indices = job.indices;
        transfers.push(job.indices.buffer as ArrayBuffer);
      }
      if (job.types) {
        payload.types = job.types;
        transfers.push(job.types.buffer as ArrayBuffer);
      }
      try {
        worker.postMessage(payload, transfers);
      } catch (e) {
        this.pending.delete(job.jobId);
        try {
          resolver.reject(e);
        } catch (e2) {}
      }
    }
  }

  destroy() {
    for (const w of this.workers)
      try {
        w.terminate();
      } catch (e) {}
    this.workers = [];
    this.pending.clear();
  }
}

let defaultPool: MeshWorkerPool | null = null;
export function getDefaultMeshWorkerPool(size?: number) {
  if (!defaultPool) defaultPool = new MeshWorkerPool(size);
  return defaultPool;
}

export default MeshWorkerPool;
