const { Worker } = require('worker_threads');
const path = require('path');

class SerializeWorkerPool {
  constructor(size = Math.max(1, require('os').cpus().length - 2)) {
    this.size = size;
    this.workers = [];
    this.free = [];
    this.taskId = 1;
    this.callbacks = new Map();

    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(path.join(__dirname, 'serializeChunkWorker.js'));
      worker.on('message', (msg) => this._handleMessage(msg, worker));
      worker.on('error', (err) => console.error('[SerializeWorkerPool] worker error', err));
      worker.on('exit', (code) => { if (code !== 0) console.warn('[SerializeWorkerPool] worker exited code', code); });
      this.workers.push(worker);
      this.free.push(worker);
    }
  }

  _handleMessage(msg, worker) {
    if (!msg || !msg.id) return;
    const cb = this.callbacks.get(msg.id);
    if (cb) {
      this.callbacks.delete(msg.id);
      cb(null, msg);
    }
    if (!this.free.includes(worker)) this.free.push(worker);
  }

  serializeChunk(chunk) {
    const id = (this.taskId++).toString();
    return new Promise((resolve, reject) => {
      const worker = this.free.pop();
      const payload = { id, cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, chunk };
      this.callbacks.set(id, (err, msg) => {
        if (err) return reject(err);
        if (msg && msg.error) return reject(new Error(msg.error));
        resolve(msg);
      });
      try {
        if (!worker) {
          // no free worker: dispatch to a random worker (best-effort)
          const fallback = this.workers[Math.floor(Math.random() * this.workers.length)];
          fallback.postMessage(payload);
        } else {
          worker.postMessage(payload);
        }
      } catch (e) {
        this.callbacks.delete(id);
        reject(e);
      }
    });
  }

  destroy() {
    for (const w of this.workers) try { w.terminate(); } catch (e) {}
    this.workers = [];
    this.free = [];
    this.callbacks.clear();
  }
}

module.exports = { SerializeWorkerPool };
