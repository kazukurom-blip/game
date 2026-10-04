// システム担当の任意 API への橋渡し（ワールド/エンティティ側から呼ぶ）。
// v3 の新規モジュール（tower / arena / bosses / daily …）は並行開発中なので、
// 存在すれば読み込み、関数があれば呼ぶ（無ければ null を返し、呼び出し側はフォールバック）。
// 探索順: game.sys[name] → 既存 systems（静的 import）→ v3 新規 systems（動的 import）。
import * as combat from '../systems/combat.js';
import * as skills from '../systems/skills.js';
import * as progression from '../systems/progression.js';
import * as inventory from '../systems/inventory.js';
import * as jobs from '../systems/jobs.js';
import * as balance from '../data/balance.js';

const STATIC = [combat, skills, progression, inventory, jobs, balance];
const DYN = {};
// SPEC_V3 §6 で作成が決まっているファイルのみ（存在しない名前は読み込まない）
const OPTIONAL = ['tower', 'arena', 'bosses', 'daily', 'achievements', 'presets', 'shared', 'guide', 'tune', 'potential'];

export const sysReady = Promise.all(OPTIONAL.map((n) =>
  import(`../systems/${n}.js`).then((m) => { DYN[n] = m; }).catch(() => { /* 未作成 */ })));

/** sysFn(name, game?, mod?) → 関数 | null。mod（'tower' 等）を指定するとそのモジュールを優先 */
export function sysFn(name, game, mod) {
  const g = game?.sys?.[name];
  if (typeof g === 'function') return g;
  if (mod && typeof DYN[mod]?.[name] === 'function') return DYN[mod][name];
  for (const m of STATIC) if (typeof m[name] === 'function') return m[name];
  for (const k of OPTIONAL) if (typeof DYN[k]?.[name] === 'function') return DYN[k][name];
  return null;
}

/** 関数があれば呼ぶ（例外は握りつぶさず console に1回だけ出す）。無ければ undefined */
const _errs = new Set();
export function sysCall(name, game, ...args) {
  const f = sysFn(name, game);
  if (!f) return undefined;
  try { return f(game, ...args); } catch (e) {
    if (!_errs.has(name)) { _errs.add(name); console.warn(`[sys.${name}]`, e); }
    return undefined;
  }
}

/** 現在の時刻（0〜24）。game.clock → map._clock → state.clock */
export function clockOf(game) {
  const c = game?.clock ?? game?.map?._clock ?? game?.state?.clock;
  return typeof c === 'number' && Number.isFinite(c) ? c : 12;
}

/** 夜か。systems の isNightNow(game) があればそれを使う */
export function nightNow(game) {
  const f = sysFn('isNightNow', game);
  if (f) { try { return !!f(game); } catch { /* fallthrough */ } }
  return balance.isNight(clockOf(game));
}

/** hours:[from, to]（時, 24h。from>to は日をまたぐ）に clock が入るか */
export function inHours(hours, clock) {
  if (!Array.isArray(hours) || hours.length < 2) return true;
  const [a, b] = hours;
  const h = ((clock % 24) + 24) % 24;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/** コンボ: systems の comboHit(game, n, enemies) があれば呼ぶ（n = 命中数） */
export function reportHits(game, hits) {
  const list = (hits || []).filter(Boolean);
  if (!list.length) return;
  const f = sysFn('comboHit', game);
  if (f) { try { f(game, list.length, list); } catch (e) { /* noop */ } }
}
