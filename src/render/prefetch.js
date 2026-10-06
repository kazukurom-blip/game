// 隣のマップの画像の先読み
//  マップに入って読み込みが落ち着いたら、ポータルでつながる隣のマップの背景・地面・敵の画像を、
//  少しずつ（同時に 2 枚まで）裏で読んでおく。ブラウザのキャッシュに入るので、移動した時の「読み込み中」が短くなる。
//  画像は保持しない（メモリを増やさない）。一度読んだ物は読み直さない。
import { MAPS } from '../world/maps.js';
import { ENEMIES_BY_MAP } from '../data/enemies.js';
import { sceneOf } from './background.js';
import { artFilesForScene } from './artOverrides.js';
import { spriteFilesForEnemies, spriteBaseUrl } from './sprites.js';
import { assetUrl } from './assetUrl.js';

const DONE = new Set();
const QUEUE = [];
let active = 0;
const MAX_ACTIVE = 2;
const ST = { queued: 0, loaded: 0, failed: 0 };

function pump() {
  while (active < MAX_ACTIVE && QUEUE.length) {
    const url = QUEUE.shift();
    if (typeof Image === 'undefined') return;
    active++;
    const im = new Image();
    const done = (ok) => { active--; if (ok) ST.loaded++; else ST.failed++; pump(); };
    im.onload = () => done(true);
    im.onerror = () => done(false);
    try { im.decoding = 'async'; } catch { /* ignore */ }
    im.src = url;
  }
}

/** そのマップで使う画像（manifest の相対パス） */
export function filesForMap(id) {
  const m = MAPS[id];
  if (!m) return [];
  const out = [];
  try { out.push(...artFilesForScene(sceneOf(m))); } catch { /* ignore */ }
  try { out.push(...spriteFilesForEnemies(ENEMIES_BY_MAP[id] || [])); } catch { /* ignore */ }
  return out;
}

/** 今のマップの隣（ポータルの行き先）の画像を先読みに並べる */
export function prefetchNeighbors(map) {
  if (!map) return 0;
  const base = spriteBaseUrl();
  let n = 0;
  for (const p of map.portals || []) {
    for (const f of filesForMap(p.to)) {
      const url = assetUrl(base, f);
      if (DONE.has(url)) continue;
      DONE.add(url); QUEUE.push(url); n++; ST.queued++;
    }
  }
  pump();
  return n;
}
export function prefetchStats() { return { ...ST, pending: QUEUE.length, active }; }
