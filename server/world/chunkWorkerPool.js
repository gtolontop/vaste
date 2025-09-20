const { Worker } = require('worker_threads');
const path = require('path');

class ChunkWorkerPool {
  constructor(size = Math.max(1, require('os').cpus().length - 1)) {
    this.size = size;
    this.workers = [];
    this.free = [];
    this.queue = []; // queued tasks when no free worker
    this.taskId = 1;
    this.callbacks = new Map();
    this._shuttingDown = false;

    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(path.join(__dirname, 'generateChunkWorker.js'));
      worker.on('message', (msg) => this._handleMessage(msg, worker));
      worker.on('error', (err) => console.error('[ChunkWorkerPool] worker error', err));
      worker.on('exit', (code) => { if (!this._shuttingDown && code !== 0) console.warn('[ChunkWorkerPool] worker exited code', code); });
      this.workers.push(worker);
      this.free.push(worker);
    }
  }

  _handleMessage(msg, worker) {
    // msg: { id, cx, cy, cz, blocksBuffer }
    if (!msg || !msg.id) return;
    const cb = this.callbacks.get(msg.id);
    if (cb) {
      this.callbacks.delete(msg.id);
      // blocksBuffer is transferred as ArrayBuffer
      cb(null, msg);
    }
    // mark worker free
    if (!this.free.includes(worker)) this.free.push(worker);
    // If there are queued tasks, immediately assign one
    const task = this.queue.shift();
    if (task) {
      const { id, cx, cy, cz } = task;
      // set callback is already done by generateChunk
      // remove worker from free and post message
      const w = this.free.pop();
      if (w) w.postMessage({ id, cx, cy, cz });
    }
  }

  generateChunk(cx, cy, cz, callback) {
    const id = (this.taskId++).toString();
    const worker = this.free.pop();
    if (!worker) {
      // No free worker: enqueue the task and attach callback. It will be processed when a worker frees.
      this.callbacks.set(id, callback);
      this.queue.push({ id, cx, cy, cz });
      return;
    }
    this.callbacks.set(id, callback);
    // send task
    worker.postMessage({ id, cx, cy, cz });
  }

  destroy() {
    this._shuttingDown = true;
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.free = [];
    this.callbacks.clear();
  }
}

module.exports = { ChunkWorkerPool };
