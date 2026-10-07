// Unity 用の音の一覧 classic-unity/Audio/audio_manifest.json を作る・更新する。
// render_bgm.mjs と render_sfx.mjs が、書き出した分だけ書き足す（ほかの欄は残す）。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './audio_render.mjs';

export const MANIFEST = path.join(ROOT, 'classic-unity/Audio/audio_manifest.json');
const MAPS_DIR = path.join(ROOT, 'classic-unity/Data/maps');

// まだ作っていない曲は、雰囲気の近いできた曲で代わりに鳴らす（作ったら自動で外れる）
const FALLBACK = {
  ship: 'town_port', market: 'town_beginner', camp: 'login',
  town_pom: 'town_beginner', town_hyoga: 'town_beginner', town_tinkle: 'town_beginner',
  town_silva: 'field_silva', town_nemuri: 'dungeon_deep', town_marina: 'town_ceres',
  town_gard: 'town_port', town_dragon: 'town_port', town_crow: 'field_swamp',
  field_port: 'field_island', field_pom: 'field_island', field_sky: 'town_ceres',
  field_snow: 'field_silva', field_sea: 'field_silva', field_star: 'town_ceres',
  field_gard: 'field_silva', field_dragon: 'field_silva',
  field_crow: 'field_swamp', field_toy: 'field_swamp', field_volcano: 'boss_mid',
  dungeon_temple: 'dungeon_deep', pq: 'field_swamp', boss_final: 'boss_big',
};

let mapCache = null;
function mapBgm() {
  if (mapCache) return mapCache;
  mapCache = {};
  if (!fs.existsSync(MAPS_DIR)) return mapCache;
  for (const f of fs.readdirSync(MAPS_DIR).filter((x) => x.endsWith('.json')).sort()) {
    try { const m = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, f), 'utf8')); if (m.bgm) (mapCache[m.bgm] ||= []).push(m.id || f.replace(/\.json$/, '')); } catch { /* 読めないマップは飛ばす */ }
  }
  return mapCache;
}
export const mapsUsingBgm = (id) => mapBgm()[id] || [];

export function updateManifest(part) {
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { /* 初めて */ }
  const out = {
    about: 'ルミナリア・クラシックの音の一覧（自動で作る: node classic/tools/render_bgm.mjs / render_sfx.mjs）。パスはこのファイルからの相対。BGM の file はループ部分だけ（AudioSource.loop=true でそのままくり返せる）。intro があれば先に鳴らし、終わる時刻に file を PlayScheduled でつなぐ。',
    bgm: { ...(cur.bgm || {}), ...(part.bgm || {}) },
    sfx: { ...(cur.sfx || {}), ...(part.sfx || {}) },
    bgmFallback: {},
  };
  // マップが使っているのにまだ無い曲 → 代わりの曲
  const used = mapBgm();
  for (const id of Object.keys(used).sort()) {
    if (out.bgm[id]) continue;
    const fb = FALLBACK[id];
    out.bgmFallback[id] = fb && out.bgm[fb] ? fb : Object.keys(out.bgm)[0] || null;
  }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n');
  console.log(`→ ${path.relative(ROOT, MANIFEST)}（BGM ${Object.keys(out.bgm).length} 曲・効果音 ${Object.keys(out.sfx).length} 個・代わりの曲 ${Object.keys(out.bgmFallback).length}）`);
}
