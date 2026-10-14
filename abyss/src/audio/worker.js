// 裏で音を作る Worker（render.js から起動される）。優先度の高い物から 1 つずつ作り、Float32Array を返す。
import { renderJob } from './render.js';

const queue = [];
let scheduled = false;

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'job') { queue.push(m); kick(); }
  else if (m.type === 'bump') { const q = queue.find((x) => x.key === m.key); if (q && m.prio > q.prio) q.prio = m.prio; }
};

function kick() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(step, 0);
}

function step() {
  scheduled = false;
  if (!queue.length) return;
  let bi = 0;
  for (let i = 1; i < queue.length; i++) if (queue[i].prio > queue[bi].prio) bi = i;
  const m = queue.splice(bi, 1)[0];
  let res = null;
  try { res = renderJob(m.job); } catch (err) { res = null; }
  if (res && res.data) self.postMessage({ key: m.key, data: res.data, sr: res.sr }, [res.data.buffer]);
  else self.postMessage({ key: m.key, data: null });
  if (queue.length) kick();
}
