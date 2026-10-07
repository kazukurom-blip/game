// スキルのデータ（skills.json）を作る。export_data.mjs から呼ぶ。
//   名前・種類・最大Lv（★の書の上限）・効果の文・MP・前提 … classic/docs/JOBS.md 4 章の表から読む
//   当たる範囲・回数・式・動きの種類・状態異常など         … classic/tools/data/skills.mjs（SKILL_MECH）
// 表とデータのつじつま（全部の行に動きがあるか・前提の名前・式が読めるか・数が 306 か）もここで検査する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_JOBS, SKILL_MECH } from '../../../classic/tools/data/skills.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JOBS_MD = path.resolve(HERE, '../../../classic/docs/JOBS.md');

const CATEGORY = { 攻: ['attack', 'area', 'ranged'], 補: ['buff', 'heal', 'movement', 'summon'], 常: ['passive'], 呼: ['summon'] };
const RANGED_WEAPONS = new Set(['弓', 'クロスボウ', 'クロー', '銃']);

/** JOBS.md の式（3+⌊x/4⌋・13-⌊x/4⌋・3x・40-x）→ データの式（3+floor(x/4)） */
export function toExpr(s) {
  return s
    .replace(/⌊([^⌋]+)⌋/g, 'floor($1)')
    .replace(/⌈([^⌉]+)⌉/g, 'ceil($1)')
    .replace(/(\d)x/g, '$1*x')
    .replace(/÷/g, '/')
    .replace(/×/g, '*')
    .replace(/\s+/g, '');
}

// 式をためしに計算する（C# の Expr と同じ書き方: x, lv, floor ceil round min max abs）
function evalExpr(src, x, lv = 50) {
  if (!/^[0-9x+\-*/().,\s a-z]*$/.test(src)) throw new Error('使えない文字: ' + src);
  const f = new Function('x', 'lv', 'floor', 'ceil', 'round', 'min', 'max', 'abs', `return (${src});`);
  return f(x, lv, Math.floor, Math.ceil, Math.round, Math.min, Math.max, Math.abs);
}

function parseTables() {
  const lines = fs.readFileSync(JOBS_MD, 'utf8').split('\n');
  const jobs = [];
  let cur = null;
  let inSkills = false;
  for (const line of lines) {
    if (line.startsWith('## 4.')) { inSkills = true; continue; }
    if (line.startsWith('## ') && inSkills) { inSkills = false; cur = null; continue; }
    if (!inSkills) continue;
    const h = /^### 4-\d+\. ([^（]+)（/.exec(line);
    if (h) { cur = { job: h[1].trim(), rows: [] }; jobs.push(cur); continue; }
    if (!cur || !line.startsWith('|') || line.startsWith('|---') || line.startsWith('| スキル')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const [rawName, cat, maxLv, desc, mp, pre] = cells;
    cur.rows.push({ rawName, cat, maxLv, desc, mp, pre });
  }
  return jobs;
}

function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

export function buildSkills(problems) {
  const tables = parseTables();
  const skills = [];
  const descByName = new Map();
  const seenMech = new Set();
  for (const { job, rows } of tables) {
    const meta = SKILL_JOBS[job];
    if (!meta) { problems.push(`スキル: JOBS.md の職 ${job} が skills.mjs の SKILL_JOBS に無い`); continue; }
    const [prefix, line, tier, branch, jobWeapons] = meta;
    const mechs = SKILL_MECH[job] || {};
    const nameToId = new Map();
    for (const r of rows) {
      const name = r.rawName.replace(/\s*★\s*$/, '');
      const m = mechs[name];
      if (m) nameToId.set(name, `${prefix}.${m.id}`);
    }
    let prevDesc = null;
    for (const r of rows) {
      const star = /★/.test(r.rawName);
      const name = r.rawName.replace(/\s*★\s*$/, '');
      const m0 = mechs[name];
      if (!m0) { problems.push(`スキル: ${job}「${name}」の動き（skills.mjs）が無い`); continue; }
      seenMech.add(job + '/' + name);
      const m = clone(m0);
      const id = `${prefix}.${m.id}`;
      // 最大 Lv（★は「20/30」= 最初 20、極意の書で 30）
      const ml = /^(\d+)(?:\/(\d+))?$/.exec(r.maxLv);
      if (!ml) { problems.push(`スキル: ${id} の最大Lv が読めない: ${r.maxLv}`); continue; }
      const maxLevel = parseInt(ml[1], 10);
      const masterLevel = ml[2] ? parseInt(ml[2], 10) : undefined;
      if (star !== !!masterLevel) problems.push(`スキル: ${id} の ★ と最大Lv「${r.maxLv}」が合わない`);
      // 効果の文（「ファイターと同じ」「共通」「斧で同上」は元の文に直す）
      let desc = r.desc;
      const same = /^(共通|同じ|.*と同じ)(（.*）)?$/.exec(desc) || /^共通の/.exec(desc);
      const sameAbove = /^(.+)で同上$/.exec(desc);
      if (sameAbove && prevDesc) desc = prevDesc.replace(/剣|槍/, sameAbove[1]);
      else if (same && descByName.has(name)) desc = descByName.get(name) + (same[2] || '');
      else if (same) problems.push(`スキル: ${id} の効果「${desc}」の元が見つからない`);
      if (!descByName.has(name)) descByName.set(name, desc);
      prevDesc = desc;
      // MP（「—」= 無し、「1 本ごとに 1」= 1 回ごと、「お金 10x」= お金を使う）
      let mp, meso;
      const mpText = r.mp.trim();
      if (mpText === '—' || mpText === '') mp = undefined;
      else if (/ごとに/.test(mpText)) mp = toExpr(mpText.replace(/^.*ごとに/, ''));
      else if (/^お金/.test(mpText)) meso = toExpr(mpText.replace(/^お金/, ''));
      else mp = toExpr(mpText);
      // 前提
      const prereqs = [];
      let prereqAny = false;
      if (m.prereqs) {
        for (const [pn, pl] of m.prereqs) {
          const pid = nameToId.get(pn);
          if (!pid) problems.push(`スキル: ${id} の前提「${pn}」が ${job} に無い`);
          prereqs.push({ skill: pid, level: pl });
        }
        prereqAny = !!m.prereqAny;
      } else if (r.pre !== '—') {
        const text = r.pre.replace(/（.*?）/g, '').trim();
        prereqAny = / または /.test(text);
        for (const part of text.split(/ または | と /)) {
          const pm = /^(.+?)\s+(\d+)$/.exec(part.trim());
          if (!pm) { problems.push(`スキル: ${id} の前提が読めない: ${r.pre}`); continue; }
          const pid = nameToId.get(pm[1]);
          if (!pid) { problems.push(`スキル: ${id} の前提「${pm[1]}」が ${job} に無い`); continue; }
          prereqs.push({ skill: pid, level: parseInt(pm[2], 10) });
        }
      }
      // 種類（攻・補・常・呼）
      const cat = r.cat;
      let kind = m.kind;
      const r0 = m.range;
      if (!kind) {
        if (cat === '常') kind = 'passive';
        else if (cat === '呼') kind = 'summon';
        else if (cat === '補') kind = m.summonSec ? 'summon' : 'buff';
        else {
          const tg = m.targets && /^\d+$/.test(m.targets) ? parseInt(m.targets, 10) : 1;
          kind = tg > 1 || r0?.around ? 'area' : (m.magic || (r0 && r0.front >= 200)) ? 'ranged' : 'attack';
        }
      }
      if (!CATEGORY[cat]) problems.push(`スキル: ${id} の種類「${cat}」が読めない`);
      else if (!CATEGORY[cat].includes(kind)) problems.push(`スキル: ${id} は「${cat}」なのに kind が ${kind}`);
      // 攻撃の既定: 2 次以降は職の武器だけ（JOBS.md 6 章）。弓・弩・クロー・銃は弾を使い、射程のパッシブがのる
      const isAttack = kind === 'attack' || kind === 'area' || kind === 'ranged';
      if (isAttack && tier >= 2 && jobWeapons && !('weapons' in m)) m.weapons = jobWeapons;
      if (m.weapons === null) delete m.weapons;
      const ranged = isAttack && !m.magic && m.weapons && m.weapons.length && m.weapons.every((w) => RANGED_WEAPONS.has(w));
      if (ranged && !('ammo' in m)) m.ammo = true;
      if (ranged && !('rangeBonus' in m)) m.rangeBonus = true;
      if (m.ammo === false) delete m.ammo;
      if (m.rangeBonus === false) delete m.rangeBonus;
      if (isAttack && !m.hits) m.hits = '1';
      if (isAttack && !m.targets) m.targets = '1';
      // 待ち時間の書いてあるスキルは cooldown があるか
      if (/待ち時間/.test(desc) && !m.cooldown) problems.push(`スキル: ${id} は待ち時間があるのに cooldown が無い`);
      if (m.cooldown && !/待ち時間/.test(desc)) problems.push(`スキル: ${id} の cooldown は JOBS.md に無い`);

      const { id: _i, kind: _k, prereqs: _p, prereqAny: _pa, ...rest } = m;
      const out = {
        id, name, job: line, tier, ...(branch >= 0 ? { branch } : {}), jobName: job, kind, maxLevel,
        ...(masterLevel ? { masterLevel } : {}), desc,
        ...(mp !== undefined ? { mp } : {}), ...(meso !== undefined ? { meso } : {}),
        ...(prereqs.length ? { prereqs } : {}), ...(prereqAny ? { prereqAny: true } : {}),
        ...rest,
      };
      if (skills.some((s) => s.id === id)) problems.push(`スキル: ID が重なっている: ${id}`);
      skills.push(out);
    }
  }
  for (const [job, mechs] of Object.entries(SKILL_MECH))
    for (const name of Object.keys(mechs)) if (!seenMech.has(job + '/' + name)) problems.push(`スキル: skills.mjs の ${job}「${name}」が JOBS.md に無い`);

  // 式が読めて、Lv 1〜最大で数になるか
  const EXPR_KEYS = /^(mp|hp|hpPct|meso|cooldown|damage|spell|fixed|hits|targets|sec|chance|power|atk|def|defPct|healPct|healMpPct|summonSec|summonHeal|teleport|instantKill|pct|cap|amount|vx|vy|mul|exp|healPerHit|hotHp|magicGuard|booster|.*Pct|.*Rate|.*Damage|.*Regen|level.*|ap.*|range|mastery|stunCrit|chainStar|dodge|berserk|guard|execute|starBundle|potion.*|stealthAttack|mesoOnHit|elementResist|resistPierce|watk|wdef|acc|avoid|speed|jump|str|dex|int|luk|matk|mdef)$/;
  const walk = (s, o, top) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && EXPR_KEYS.test(k) && !(top && (k === 'desc' || k === 'name'))) {
        for (const x of [1, s.maxLevel, s.masterLevel || s.maxLevel]) {
          let val;
          try { val = evalExpr(v, x); } catch (e) { problems.push(`スキル: ${s.id} の ${k}「${v}」が読めない`); break; }
          if (!Number.isFinite(val)) { problems.push(`スキル: ${s.id} の ${k}「${v}」が数にならない（x=${x}）`); break; }
        }
      } else if (typeof v === 'object' && k !== 'weapons') walk(s, v, false);
    }
  };
  for (const s of skills) walk(s, s, true);

  // 数（JOBS.md 5 章）
  const count = (t) => skills.filter((s) => s.tier === t).length;
  const want = [3, 30, 82, 87, 104];
  for (let t = 0; t <= 4; t++) if (count(t) !== want[t]) problems.push(`スキル: ${t} 次のスキルが ${count(t)}（JOBS.md 5 章は ${want[t]}）`);
  if (skills.length !== 306) problems.push(`スキル: 合計 ${skills.length}（JOBS.md は 306）`);
  return skills;
}
