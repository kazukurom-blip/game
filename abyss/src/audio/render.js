// 音を作る作業（効果音・楽器の 1 音）を、画面が固まらないよう裏の Worker でまとめて行う。
// Worker が使えない環境（古いブラウザ・制限の強い iframe・Node のテスト）では、同じ処理を少しずつ本体で行う。

import { renderSfx } from './sfx.js';
import { renderInstrument, renderDrum } from './instruments.js';

/** 作る物 → { data: Float32Array, sr } */
export function renderJob(job) {
  switch (job.kind) {
    case 'sfx': { const sr = job.sr || 44100; const d = renderSfx(job.id, sr, job.v || 0); return d ? { data: d, sr } : null; }
    case 'inst': return renderInstrument(job.id, job.root);
    case 'drum': return renderDrum(job.id);
    default: return null;
  }
}

export const jobKey = (job) => (job.kind === 'sfx' ? `sfx:${job.id}:${job.v || 0}` : job.kind === 'inst' ? `inst:${job.id}@${job.root}` : `drum:${job.id}`);

export class Renderer {
  constructor({ worker = true } = {}) {
    this.done = new Map(); // key → { data, sr } | null
    this.waiting = new Map(); // key → [resolve...]
    this.queue = []; // 本体で作る待ち行列 [{ key, job, prio }]
    this.pumping = false;
    this.worker = null;
    this.stats = { jobs: 0, worker: 0, main: 0, ms: 0 };
    if (worker && typeof Worker !== 'undefined' && typeof URL !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this.onResult(e.data);
        this.worker.onerror = (e) => { try { e.preventDefault?.(); } catch { /* ignore */ } this.useMainThread(); };
      } catch { this.worker = null; }
    }
  }

  get usingWorker() { return !!this.worker; }

  /** 作ってもらう。prio が大きいほど先 */
  request(job, prio = 0) {
    const key = jobKey(job);
    if (this.done.has(key)) return Promise.resolve(this.done.get(key));
    return new Promise((resolve) => {
      const w = this.waiting.get(key);
      if (w) { w.push(resolve); this.bump(key, prio); return; }
      this.waiting.set(key, [resolve]);
      this.stats.jobs++;
      if (this.worker) { this.worker.postMessage({ type: 'job', key, job, prio }); return; }
      this.queue.push({ key, job, prio });
      this.pump();
    });
  }

  bump(key, prio) {
    if (this.worker) { this.worker.postMessage({ type: 'bump', key, prio }); return; }
    const q = this.queue.find((x) => x.key === key);
    if (q && prio > q.prio) q.prio = prio;
  }

  /** すぐに作る（本体で・同期） */
  now(job) {
    const key = jobKey(job);
    if (this.done.has(key)) return this.done.get(key);
    const t0 = globalThis.performance?.now?.() ?? 0;
    let res = null;
    try { res = renderJob(job); } catch (e) { console.warn('[audio] 音を作れない', key, e); }
    this.stats.ms += (globalThis.performance?.now?.() ?? 0) - t0;
    this.stats.main++;
    this.finish(key, res);
    return res;
  }

  has(job) { return this.done.has(jobKey(job)); }
  get(job) { return this.done.get(jobKey(job)) || null; }

  onResult(m) {
    if (!m || !m.key) return;
    this.stats.worker++;
    this.finish(m.key, m.data ? { data: m.data, sr: m.sr } : null);
  }

  finish(key, res) {
    this.done.set(key, res);
    const w = this.waiting.get(key);
    this.waiting.delete(key);
    this.queue = this.queue.filter((x) => x.key !== key);
    if (w) for (const r of w) { try { r(res); } catch (e) { console.error(e); } }
  }

  /** Worker が動かなかった: 残りを本体で作る */
  useMainThread() {
    if (!this.worker) return;
    try { this.worker.terminate(); } catch { /* ignore */ }
    this.worker = null;
    for (const key of this.waiting.keys()) {
      if (this.queue.some((x) => x.key === key)) continue;
      const [kind, rest] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
      let job = null;
      if (kind === 'sfx') { const [id, v] = rest.split(':'); job = { kind, id, v: Number(v) }; }
      else if (kind === 'inst') { const [id, root] = rest.split('@'); job = { kind, id, root: Number(root) }; }
      else job = { kind, id: rest };
      this.queue.push({ key, job, prio: 0 });
    }
    this.pump();
  }

  pump() {
    if (this.pumping || !this.queue.length) return;
    this.pumping = true;
    const step = () => {
      this.pumping = false;
      if (!this.queue.length) return;
      // 1 回に約 8ms ぶんだけ作る（画面を止めない）
      const t0 = globalThis.performance?.now?.() ?? 0;
      do {
        this.queue.sort((a, b) => b.prio - a.prio);
        const q = this.queue.shift();
        if (!this.done.has(q.key)) this.now(q.job);
      } while (this.queue.length && (globalThis.performance?.now?.() ?? 1e9) - t0 < 8);
      if (this.queue.length) { this.pumping = true; setTimeout(step, 0); }
    };
    setTimeout(step, 0);
  }
}
