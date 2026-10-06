// 会話の窓（MapleStory の NPC 会話の形）
//  左: NPC の大きな顔（立ち絵があれば立ち絵）＋名前の札 / 右: 本文の欄（紙の色。1 文字ずつ流れる・長い文は自動でページ分け）
//  下: ボタンの並び（会話を終える / 前へ / 次へ / 受ける / 断る / OK）
//  画面の種類（win.mode）:
//    talk   … 本文だけ（ページ送り）
//    list   … 本文＋青い文字の項目の一覧（NPC に話しかけた最初の画面・選択肢）。項目は最後のページを出し切ったら出る
//    quest  … クエストの受注の窓（クエスト名・目的・報酬のアイコン）＋「受ける」「断る」
//    reward … 報告の報酬（アイコンが順に出る短い演出）＋「OK」
//  本文の強調の書き方（#b 青・#r 赤・#d 紫・#g 緑・#k 元の色 など）は parseRich と docs/SPEC_V4.md「会話画面」。
//  テストとの約束（tests/smoke.mjs）: win.lines[i] = i ページ目の文字（強調の記号を除く）、win.li = 今のページ、
//  win.chars = 出た文字数、win.opts = 項目・ボタン（label）、win.optSel = 選んでいる番号。Enter で送る・決める。
import { COL, FONT, txt, rrPath, rgba, clamp, fmtMoney, lighten, darken } from './theme.js';
import {
  guard, getItemDef, missionDef, turnInNpc, drawChar, drawItemIco, equipLooks, looksFrom, enemyDef, mapInfo, countItem,
} from './deps.js';
import { charLook, charName, jobOffer, JOBS, MISSION_NPCS } from './v3deps.js';
import { itemTip, rewardText, findNpcName, npcOf } from './windows.js';
import * as SpriteM from '../render/sprites.js';

const W = 1280, H = 720;
const TYPE_SPEED = 46;     // 1 秒に出る文字数

// ================================================================ 大きさ（PC / スマホのタッチ）
const PC = { w: 960, face: 168, plate: 28, fs: 16, lh: 30, lines: 4, row: 36, rows: 6, btnH: 36, btnW: 120, pad: 16 };
const TOUCH = { w: 1200, face: 190, plate: 34, fs: 21, lh: 36, lines: 4, row: 54, rows: 4, btnH: 58, btnW: 170, pad: 18 };
function isTouch() {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
}
const S = () => (isTouch() ? TOUCH : PC);

// ================================================================ 強調の書き方
// 紙の上の色（MapleStory の #b #r #d に合わせる。白い紙で読める濃さ）
const INK = '#2b2346';
export const RICH_COLORS = { b: '#1f5fe8', r: '#e02648', d: '#8a33d6', g: '#138a4a' };
// 参照（#t<アイテムID># など）の既定の色。色を指定していないときだけ付く
const REF_COLOR = { t: 'b', m: 'g', p: 'd', o: 'r', c: 'r' };
const NOSTART = '、。，．・：；？！ー」』）】〉》…‥〜!?,.)]';

function refName(kind, id, g) {
  switch (kind) {
    case 't': return getItemDef(id)?.name || id;
    case 'm': return guard('mapInfo', () => mapInfo(id)?.name, null) || id;
    case 'p': return findNpcName(g || {}, id) || id;
    case 'o': return enemyDef(id)?.name || id;
    case 'c': return String(guard('count', () => countItem(g?.state, id), 0) || 0);
    default: return id;
  }
}
/** 強調の記号を含む文字列 → 文字の並び [{ch, c(色キー|null), b(太字), nl?}] */
export function parseRich(src, g) {
  const s = String(src ?? '');
  const out = [];
  let c = null, b = false;
  const push = (str, col = c) => { for (const ch of str) out.push({ ch, c: col, b }); };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') { out.push({ nl: true }); continue; }
    if (ch !== '#') { push(ch); continue; }
    const n = s[i + 1];
    if (n === '#') { push('#'); i++; continue; }
    if (n === 'k') { c = null; i++; continue; }
    if (RICH_COLORS[n]) { c = n; i++; continue; }
    if (n === 'e') { b = true; i++; continue; }
    if (n === 'n') { b = false; c = null; i++; continue; }
    if (n === 'h') {
      // 主人公の名前: #h# / #h # / #h
      push(guard('charName', () => charName(g?.state), '') || 'あなた');
      i++;
      if (s[i + 1] === '#') i++;
      else if (s[i + 1] === ' ' && s[i + 2] === '#') i += 2;
      continue;
    }
    if (REF_COLOR[n]) {
      const m = /^([A-Za-z0-9_]+)#/.exec(s.slice(i + 2));
      if (m) { push(refName(n, m[1], g), c || REF_COLOR[n]); i += 1 + m[0].length; continue; }
    }
    push('#');
  }
  return out;
}
/** 強調の記号を除いた文字 */
export function plainRich(src, g) { return parseRich(src, g).filter((x) => !x.nl).map((x) => x.ch).join(''); }
const esc = (s) => String(s ?? '').replace(/#/g, '##');

// 文字の幅（画面外の canvas で測る。node の単体テストでは概算）
let _mctx = null;
const _mw = new Map();
function measureCh(ch, size, bold) {
  const k = size + (bold ? 'b' : '') + ch;
  let v = _mw.get(k);
  if (v !== undefined) return v;
  if (_mctx === null) {
    _mctx = false;
    try { const cv = globalThis.document?.createElement('canvas'); _mctx = cv?.getContext('2d') || false; } catch { _mctx = false; }
  }
  if (_mctx) { _mctx.font = `${bold ? 900 : 700} ${size}px ${FONT}`; v = _mctx.measureText(ch).width; } else v = /[\x20-\x7e]/.test(ch) ? size * 0.56 : size;
  if (_mw.size > 6000) _mw.clear();
  _mw.set(k, v);
  return v;
}
try { globalThis.document?.fonts?.addEventListener?.('loadingdone', () => _mw.clear()); } catch { /* ignore */ }
/** 文字の並び → 行 [[文字...]]（日本語は 1 文字ずつ。行頭に来てはいけない記号はぶら下げる） */
function wrapRich(glyphs, maxW, size) {
  const lines = [];
  let line = [], lw = 0;
  for (const gl of glyphs) {
    if (gl.nl) { lines.push(line); line = []; lw = 0; continue; }
    const w = measureCh(gl.ch, size, gl.b);
    if (lw + w > maxW && line.length && !NOSTART.includes(gl.ch)) {
      // 空白で折り返すときは空白を捨てる
      lines.push(line); line = []; lw = 0;
      if (gl.ch === ' ' || gl.ch === '　') continue;
    }
    line.push(gl); lw += w;
  }
  if (line.length || !lines.length) lines.push(line);
  return lines;
}

// ================================================================ ページ・文の流し方
// 主人公のセリフ: 行の先頭に "@me:" / "@hero:"（全角コロン可）
const HERO_LINE = /^@(?:me|hero)\s*[:：]\s*/;
function geoBase() {
  const s = S();
  const x = (W - s.w) / 2;
  const fx = x + s.pad, px = fx + s.face + s.pad;
  const pw = x + s.w - s.pad - px;
  return { s, x, fx, px, pw, tw: pw - 36 };
}
/** 1 つの文 → ページ [{who, lines, text, len}] */
function paginate(g, text, who, maxLines) {
  const { s, tw } = geoBase();
  const lines = wrapRich(parseRich(text, g), tw, s.fs);
  const per = Math.max(1, maxLines || s.lines);
  const pages = [];
  for (let i = 0; i < lines.length; i += per) {
    const ls = lines.slice(i, i + per);
    const t = ls.map((l) => l.map((x) => x.ch).join('')).join('');
    pages.push({ who, lines: ls, text: t, len: t.length });
  }
  return pages;
}
function entryOf(l) {
  if (l && typeof l === 'object') return { text: String(l.text ?? ''), who: l.who === 'me' || l.who === 'hero' ? 'me' : null };
  const s = String(l ?? ''), m = HERO_LINE.exec(s);
  return { text: m ? s.slice(m[0].length) : s, who: m ? 'me' : null };
}
const isChoiceLine = (l) => !!(l && typeof l === 'object' && Array.isArray(l.choices) && l.choices.length);

/**
 * say(ui, win, lines, after, o) — 文を流す。
 *  lines: 文字列か {text, who} の配列。{ask, choices:[...]} を混ぜると、そこで選択肢を出して分かれる（SPEC_V4「会話画面」）
 *  after: 最後のページを送ったときに呼ぶ（無ければ endTalk）
 *  o: { mode:'talk'|'list'|'quest'|'reward', opts, card, reward, maxLines }
 */
function say(ui, win, lines, after, o = {}) {
  const arr = (Array.isArray(lines) ? lines : [lines]).filter((l) => l != null);
  const k = arr.findIndex(isChoiceLine);
  if (k >= 0) {
    const pre = arr.slice(0, k), q = arr[k], rest = arr.slice(k + 1);
    // 問いの文（ask）が無ければ、直前の文を問いにする
    const ask = q.ask != null ? [q.ask] : (pre.length ? [pre.pop()] : ['……どうする？']);
    const showQ = () => showChoices(ui, win, {
      lines: ask, key: q.id, choices: q.choices, cancelText: q.cancel ?? false,
      onPick: (id, c) => say(ui, win, [...(Array.isArray(c?.lines) ? c.lines : []), ...rest], after, o),
      onCancel: () => menuOrClose(ui, win),
    });
    if (pre.length) sayPlain(ui, win, pre, showQ, {}); else showQ();
    return;
  }
  sayPlain(ui, win, arr, after, o);
}
function sayPlain(ui, win, arr, after, o = {}) {
  const g = ui.game;
  const pages = [];
  for (const l of arr) {
    const e = entryOf(l);
    pages.push(...paginate(g, e.text, e.who, o.maxLines));
  }
  if (!pages.length) { const fn = after; if (fn) fn(); else endTalk(ui, win); return; }
  win.mode = o.mode || 'talk';
  win.pages = pages;
  win.lines = pages.map((p) => p.text);
  win.who = pages.map((p) => p.who);
  win.li = 0; win.chars = 0;
  win.opts = o.opts || null; win.optSel = 0; win.scroll = 0;
  win.after = after || null;
  win.card = o.card || null;
  win.reward = o.reward || null;
  win.modeT = win.t || 0;
}
/** 毎フレーム（ui.update から）: 文字を流す */
export function dialogTick(win, dt) {
  if (!win?.lines) return;
  const line = win.lines[win.li] || '';
  if (win.chars < line.length) win.chars = Math.min(line.length, win.chars + dt * TYPE_SPEED);
}
const pageDone = (win) => win.chars >= (win.lines?.[win.li] || '').length;
const lastPage = (win) => (win.li || 0) >= (win.lines?.length || 1) - 1;
const optsShown = (win) => !!(win.opts && pageDone(win) && lastPage(win));

function advance(ui, win) {
  if (!pageDone(win)) { win.chars = (win.lines[win.li] || '').length; return; }
  if (!lastPage(win)) { win.li++; win.chars = 0; return; }
  if (win.opts) return;
  const after = win.after;
  win.after = null;
  if (after) after(); else endTalk(ui, win);
}
function back(win) {
  if ((win.li || 0) <= 0) return;
  win.li--; win.chars = (win.lines[win.li] || '').length;
}
function pick(ui, win, i) {
  const o = win.opts?.[i];
  if (!o || o.disabled) return;
  win.optSel = i;
  o.fn?.();
}
/** 会話の最後: 項目のある NPC は最初の画面へ、無ければ閉じる */
function endTalk(ui, win) { menuOrClose(ui, win); }
function menuOrClose(ui, win) {
  if (hasMenu(ui, win)) menu(ui, win);
  else ui.close('dialog');
}

// ================================================================ 選択肢（派生）
/**
 * showChoices(ui, win, {prompt|lines, choices:[{id, text, hint?, color?}], onPick(id, choice), onCancel?, cancelText?, key?})
 *  選択肢の一覧（2〜4 個。6 個まで）を青い文字の項目で出す。選んだら 'dialogChoice' {npcId, key, id} を出して onPick を呼ぶ
 */
export function showChoices(ui, win, o = {}) {
  const g = ui.game, npc = npcOf(win);
  const opts = (o.choices || []).slice(0, 6).map((c, i) => ({
    kind: 'choice', label: String(c.text ?? c.label ?? `選択肢${i + 1}`), text: c.text ?? c.label, hint: c.hint, color: c.color, num: i + 1,
    fn: () => {
      guard('emit', () => g.events?.emit?.('dialogChoice', { npcId: npc.id || null, key: o.key ?? null, id: c.id ?? i, index: i }));
      if (typeof o.onPick === 'function') o.onPick(c.id ?? i, c);
      else endTalk(ui, win);
    },
  }));
  if (o.cancelText !== false) {
    opts.push({ kind: 'cancel', label: o.cancelText || 'もう少し考える', fn: () => { if (typeof o.onCancel === 'function') o.onCancel(); else endTalk(ui, win); } });
  }
  say(ui, win, o.lines || [o.prompt ?? '……どうする？'], null, { mode: 'list', opts });
}

// ================================================================ 最初の画面（項目の一覧）
function npcMissions(ui, npc) {
  const g = ui.game, st = g.state || {}, mm = g.missions;
  const act = st.missions?.active || [], done = st.missions?.completed || [];
  if (!npc?.id) return [];
  const map = new Map();
  for (const a of guard('missions.available', () => mm?.available?.(npc.id), []) || []) { const m = missionDef(a); if (m) map.set(m.id, m); }
  for (const a of guard('missions.completable', () => mm?.completable?.(npc.id), []) || []) { const m = missionDef(a); if (m) map.set(m.id, m); }
  for (const a of guard('missions.inProgress', () => mm?.inProgress?.(npc.id), []) || []) { const m = missionDef(a); if (m) map.set(m.id, m); }
  for (const id of act) { const m = missionDef(id); if (m && turnInNpc(m) === npc.id) map.set(id, m); }
  const out = [];
  for (const m of map.values()) {
    let status = null;
    if (act.includes(m.id)) status = guard('isComplete', () => mm?.isComplete?.(m.id), false) ? 'report' : 'active';
    else if (!done.includes(m.id) || m.daily || m.repeat) status = guard('canAccept', () => mm?.canAccept?.(m.id), true) !== false ? 'offer' : null;
    if (status) out.push({ m, status });
  }
  const order = { report: 0, offer: 1, active: 2 };
  return out.sort((a, b) => order[a.status] - order[b.status]);
}
function chosenOf(g, id) {
  const ms = g.state?.missions;
  if (typeof g.missions?.needsChoice === 'function') return guard('needsChoice', () => !g.missions.needsChoice(id), true) ? (g.state?.storyChoices?.[id] || true) : null;
  return g.state?.storyChoices?.[id] ?? ms?.choices?.[id] ?? null;
}
function linesOf(g, m, phase) {
  const l = guard('mdialog', () => g.missions?.dialog?.(m.id, phase), null);
  return l?.length ? l : (m.dialog?.[phase]?.length ? m.dialog[phase] : null);
}
function progressOf(g, m) {
  const vals = guard('objValues', () => g.missions?.objectiveValues?.(m.id), null) || [];
  let have = 0, need = 0;
  (m.objectives || []).forEach((o, i) => { need += o.count || 1; have += Math.min(o.count || 1, vals[i] || 0); });
  return need ? `${have}/${need}` : '';
}
/** NPC の項目 [{kind, label, text, sub, fn}]（label はテストとの約束: '？ 報告: ' '！ 依頼: ' など） */
function menuItems(ui, win) {
  const g = ui.game, npc = npcOf(win), st = g.state;
  const items = [];
  for (const { m, status } of npcMissions(ui, npc)) {
    if (status === 'report') items.push({ kind: 'report', label: '？ 報告: ' + m.name, text: m.name, sub: '報告できる', fn: () => reportQuest(ui, win, m) });
    else if (status === 'offer') items.push({ kind: 'offer', label: '！ 依頼: ' + m.name, text: m.name, sub: m.daily ? 'デイリー' : `Lv.${m.reqLevel || 1}〜`, fn: () => offerQuest(ui, win, m) });
    else items.push({ kind: 'active', label: '… 進行中: ' + m.name, text: m.name, sub: '進行中 ' + progressOf(g, m), fn: () => questCard(ui, win, m, 'active') });
  }
  if (npc.shop?.length) items.push({ kind: 'shop', label: '🛒 ショップ', text: 'ショップを見る', fn: () => { ui.close('dialog'); ui.open('shop', { npc }); } });
  // 転職: この NPC が次の転職の教官で、まだ転職の試練を受けていないとき
  const offer = npc.id ? jobOffer(st) : null;
  if (offer && !offer.active && (offer.options || []).some((id) => JOBS[id]?.instructor === npc.id)) {
    items.push({ kind: 'job', label: '転職の相談', text: '転職の相談をする', fn: () => { ui.close('dialog'); ui.open('jobOffer'); } });
  }
  if (npc.taxi || npc.service === 'taxi') items.push({ kind: 'taxi', label: 'タクシーに乗る', text: 'タクシーに乗る', fn: () => { ui.close('dialog'); ui.open('worldmap'); } });
  if (npc.service === 'content') items.push({ kind: 'content', label: 'コンテンツ受付', text: 'タワー・アリーナ・ボスの受付', fn: () => { ui.close('dialog'); ui.open('content', { npc, from: 'npc' }); } });
  if ((npc.dialog?.length || 0) > 1) {
    items.push({ kind: 'talk', label: '話を聞く', text: '話を聞く', fn: () => say(ui, win, npc.dialog.slice(1), null) });
  }
  return items;
}
/** クエスト・用事のある NPC か（「話を聞く」だけなら、今まで通りセリフを順に話す） */
function hasMenu(ui, win) { return menuItems(ui, win).some((o) => o.kind !== 'talk'); }
function greetingOf(npc) {
  return npc.greeting || npc.dialog?.[0] || '…やあ。';
}
function menu(ui, win) {
  const npc = npcOf(win);
  say(ui, win, [greetingOf(npc)], null, { mode: 'list', opts: menuItems(ui, win), maxLines: 3 });
}

export function initDialog(ui, win) {
  const npc = npcOf(win), d = win.data || {};
  win.card = null; win.reward = null;
  if (d.choice) { showChoices(ui, win, d.choice); return; }
  if (Array.isArray(d.lines)) { say(ui, win, d.lines, () => { guard('onDone', () => d.onDone?.()); menuOrClose(ui, win); }); return; }
  if (hasMenu(ui, win)) menu(ui, win);
  else say(ui, win, npc.dialog?.length ? npc.dialog : ['…やあ。'], null);
}

// ================================================================ クエストの受注・報告
function offerQuest(ui, win, m) {
  const g = ui.game;
  say(ui, win, linesOf(g, m, 'offer') || [m.desc || '頼みがある。'], () => questCard(ui, win, m, 'offer'));
}
function questCard(ui, win, m, kind) {
  const g = ui.game;
  const opts = kind === 'offer' ? [
    { kind: 'btn', primary: true, label: '受ける', fn: () => {
      const r = guard('accept', () => g.missions?.accept?.(m.id), null);
      if (r === false) { ui.notify('受注できませんでした', COL.bad); menu(ui, win); return; }
      say(ui, win, ['頼んだぜ。気をつけてな。'], null);
    } },
    { kind: 'btn', label: '断る', fn: () => say(ui, win, ['そうか…気が向いたらまた来な。'], null) },
  ] : [
    { kind: 'btn', primary: true, label: '戻る', fn: () => menu(ui, win) },
  ];
  say(ui, win, [''], null, { mode: 'quest', card: { m, kind }, opts });
}
function reportQuest(ui, win, m) {
  const g = ui.game;
  if (m.choices?.length && !chosenOf(g, m.id)) { askMissionChoice(ui, win, m); return; }
  const res = guard('turnIn', () => g.missions?.turnIn?.(m.id), null);
  if (res === false) { ui.notify('まだ報告できません', COL.bad); return; } // 成功通知は MissionManager 側
  say(ui, win, linesOf(g, m, 'done') || ['よくやってくれた！'], () => rewardScreen(ui, win, m, m.reward || {}));
}
function rewardScreen(ui, win, m, rw) {
  say(ui, win, [''], null, {
    mode: 'reward', reward: { m, rw },
    opts: [{ kind: 'btn', primary: true, label: 'OK', fn: () => say(ui, win, ['また頼むぜ。'], null) }],
  });
}
// ストーリー分岐（m.choices = [{id, text, reward, flag, dialog?}]）: 報告のときに選ぶ → MissionManager.choose → turnIn
function askMissionChoice(ui, win, m) {
  const g = ui.game;
  const prompt = m.dialog?.choice?.length ? m.dialog.choice : (m.choicePrompt ? [m.choicePrompt] : ['……で、どうする？ ここが分かれ道だぜ。']);
  showChoices(ui, win, {
    lines: prompt, key: m.id,
    choices: m.choices.map((c) => ({ id: c.id, text: c.text, hint: rewardText(c.reward || {}) })),
    onCancel: () => menu(ui, win),
    onPick: (cid) => {
      const c = m.choices.find((x) => x.id === cid) || m.choices[0];
      const r = guard('choose', () => g.missions?.choose?.(m.id, c.id), null);
      if (r === false || r?.ok === false) { ui.notify(r?.msg || '選べませんでした', COL.bad); menu(ui, win); return; }
      if (r == null && g.state) (g.state.storyChoices ||= {})[m.id] = c.id; // choose 未実装時の保険
      const stillActive = (g.state?.missions?.active || []).includes(m.id);
      if (stillActive && guard('isComplete', () => g.missions?.isComplete?.(m.id), false)) guard('turnIn', () => g.missions?.turnIn?.(m.id), null);
      say(ui, win, c.dialog?.length ? c.dialog : (m.dialog?.done?.length ? m.dialog.done : ['……そうか。それがお前の答えか。']), () => {
        const R = m.reward || {}, C = c.reward || {};
        rewardScreen(ui, win, m, { ...R, money: (R.money || 0) + (C.money || 0), items: [...(R.items || []), ...(C.items || [])] });
      });
    },
  });
}

// ================================================================ キーボード
export function dialogKey(ui, win, P, eat) {
  if (!win || win.t < 0.15) return;
  const shown = optsShown(win);
  const n = win.opts?.length || 0;
  if (shown && n) {
    const horiz = win.mode === 'quest' || win.mode === 'reward';
    if (P('up') || (horiz && P('left'))) { win.optSel = (win.optSel - 1 + n) % n; eat('up'); eat('left'); }
    if (P('down') || (horiz && P('right'))) { win.optSel = (win.optSel + 1) % n; eat('down'); eat('right'); }
    if (P('confirm') || P('interact') || P('talk')) { eat('confirm'); eat('interact'); eat('talk'); eat('jump'); pick(ui, win, win.optSel); }
    else if (!horiz && P('left') && win.li > 0) { eat('left'); back(win); }
  } else if (P('confirm') || P('interact') || P('jump') || P('talk')) {
    eat('confirm'); eat('interact'); eat('talk'); eat('jump');
    advance(ui, win);
  } else if (P('left')) { eat('left'); back(win); }
  else if (P('right')) { eat('right'); advance(ui, win); }
}

// ================================================================ スマホのタッチ: 会話中は画面のボタン（#touch）を隠す（窓の上に重なるため）
let _touchHidden = false;
export function syncDialogTouch(open) {
  if (open === _touchHidden) return;
  _touchHidden = open;
  guard('touchHide', () => {
    const el = globalThis.document?.getElementById?.('touch');
    if (el) el.style.visibility = open ? 'hidden' : '';
  });
}

// ================================================================ 描画
function heroArtKey(g) {
  const st = g.state;
  if (!st) return null;
  const lk = guard('charLook', () => charLook(st), null) || {};
  const cls = lk.classId || st.heroId, gen = lk.gender || st.gender;
  return cls && gen ? cls + '_' + gen : null;
}
/** 会話での主人公の表情（立ち絵）: 報酬=smile、「！？」=surprised、「…」で始まる=sad */
function heroExprOf(win, line) {
  if (win.mode === 'reward') return 'smile';
  if (/[!！][?？]|[?？][!！]/.test(line)) return 'surprised';
  if (/^[…‥]/.test(line)) return 'sad';
  if (/♪|ありがと|やった/.test(line)) return 'smile';
  return null;
}
const CAT = { main: ['メイン', '#ff5fa2'], sub: ['サブ', '#3d8eff'], daily: ['デイリー', '#19b8a8'], job: ['転職', '#b45cff'] };

/** 目的の 1 行（「○○を 10 体倒す」の形。強調の記号つき） */
function objLine(g, o) {
  const n = o.count || 1;
  switch (o.type) {
    case 'kill': return `#r${esc(enemyDef(o.target)?.name || o.target)}#k を #r${n}#k 体倒す`;
    case 'boss': return `ボス #r${esc(enemyDef(o.target)?.name || o.target)}#k を倒す`;
    case 'collect': return `#b${esc(getItemDef(o.target)?.name || o.target)}#k を #r${n}#k 個集める`;
    case 'talk': return `#d${esc(findNpcName(g, o.target))}#k と話す`;
    case 'reach': return `#g${esc(guard('mapInfo', () => mapInfo(o.target)?.name, null) || o.target)}#k へ行く`;
    default: return esc(o.text || o.type || '');
  }
}
function rewardList(rw) {
  const out = [];
  if (rw.exp) out.push({ kind: 'exp', n: rw.exp, label: `${Number(rw.exp).toLocaleString('en-US')}` });
  if (rw.money) out.push({ kind: 'money', n: rw.money, label: fmtMoney(rw.money) });
  if (rw.sp) out.push({ kind: 'sp', n: rw.sp, label: `SP +${rw.sp}` });
  const cnt = new Map();
  for (const id of rw.items || []) cnt.set(id, (cnt.get(id) || 0) + 1);
  for (const [id, n] of cnt) { const it = getItemDef(id); if (it) out.push({ kind: 'item', it, n, label: n > 1 ? `×${n}` : '' }); }
  return out;
}

/** 窓の大きさを、画面の種類と中身から決める（下寄りの中央） */
function layout(ui, win) {
  const b = geoBase(), s = b.s, g = ui.game;
  let content;
  const page = win.pages?.[win.li];
  const pl = Math.max(1, page?.lines?.length || 1);
  if (win.mode === 'list') {
    const n = win.opts?.length || 0;
    content = 16 + pl * s.lh + 10 + Math.min(n, s.rows) * s.row + (n > s.rows ? 22 : 0) + 12;
  } else if (win.mode === 'quest') {
    const m = win.card?.m || {};
    const nObj = Math.min(4, (m.objectives || []).length);
    const descL = m.desc ? Math.min(2, wrapRich(parseRich(m.desc, g), b.tw, s.fs - 1).length) : 0;
    content = 14 + 30 + descL * (s.lh - 6) + 10 + 24 + nObj * (s.lh - 2) + 10 + 24 + 76 + 6;
  } else if (win.mode === 'reward') {
    content = 14 + 40 + 28 + 24 + 76 + 10;
  } else content = 16 + s.lines * s.lh + 30;
  const col = s.face + 6 + s.plate;
  const paperH = Math.max(content, col);
  const h = s.pad + paperH + 12 + s.btnH + 14;
  const y = clamp(H - 20 - h, 6, H - h);
  Object.assign(win, { x: b.x, y, w: s.w, h });
  return { ...b, y, h, paperH, py: y + s.pad, fy: y + s.pad };
}

export function drawDialog(ui, ctx, win) {
  const g = ui.game, npc = npcOf(win);
  if (!win.lines) initDialog(ui, win);
  const L = layout(ui, win), s = L.s;
  const { x, y, w, h } = win;
  const t = g.time || ui.frame / 60;
  const meTalks = win.who?.[win.li] === 'me';
  // 窓の土台（クリックを吸う。窓のドラッグはしない）
  ui.hit(win, 'bg', { x, y, w, h }, { onClick: () => {} });
  drawFrame(ctx, x, y, w, h);
  drawFace(ui, ctx, win, L, meTalks, t);
  // 本文の欄（紙）
  const { px, py, pw, paperH } = L;
  ctx.save();
  rrPath(ctx, px, py, pw, paperH, 10);
  const pg = ctx.createLinearGradient(0, py, 0, py + paperH);
  pg.addColorStop(0, '#fffdf8'); pg.addColorStop(1, '#f3eefc');
  ctx.fillStyle = pg; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(123,47,247,0.55)'; ctx.stroke();
  ctx.restore();
  const shown = optsShown(win);
  if (win.mode === 'quest' && win.card) drawCard(ui, ctx, win, L);
  else if (win.mode === 'reward' && win.reward) drawReward(ui, ctx, win, L);
  else {
    const yy = drawPage(ctx, win, px + 18, py + 16 + s.lh / 2, s);
    if (win.mode === 'list' && shown) drawList(ui, ctx, win, L, yy + 4);
    // 送りの印（右下で点滅）
    if (pageDone(win) && !(win.mode === 'list' && lastPage(win))) {
      const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 4));
      txt(ctx, '次へ ▼', px + pw - 14, py + paperH - 16 + Math.sin(t * 6) * 2, { size: s.fs - 3, align: 'right', color: '#7b2ff7', alpha: a, stroke: false });
    }
    if ((win.lines?.length || 0) > 1) txt(ctx, `${win.li + 1} / ${win.lines.length}`, px + 16, py + paperH - 15, { size: s.fs - 5, color: '#9a90bb', stroke: false });
    // 本文のクリックで送る（項目が出ていないとき）
    if (!shown) ui.hit(win, 'adv', { x: px, y: py, w: pw, h: paperH }, { onClick: () => advance(ui, win) });
  }
  drawButtons(ui, ctx, win, L);
}

function drawFrame(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
  rrPath(ctx, x, y, w, h, 14);
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, 'rgba(58,44,134,0.97)'); bg.addColorStop(1, 'rgba(24,16,60,0.97)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
  rrPath(ctx, x + 4, y + 4, w - 8, h - 8, 11);
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,95,162,0.55)'; ctx.stroke();
  ctx.restore();
}

/** 左: 大きな顔（立ち絵があれば立ち絵）＋名前の札 */
function drawFace(ui, ctx, win, L, meTalks, t) {
  const g = ui.game, npc = npcOf(win), s = L.s;
  const fx = L.fx, fy = L.fy, fs = s.face;
  ctx.save();
  rrPath(ctx, fx, fy, fs, fs, 12);
  const bg = ctx.createLinearGradient(0, fy, 0, fy + fs);
  bg.addColorStop(0, '#ffb07a'); bg.addColorStop(0.55, '#d0559f'); bg.addColorStop(1, '#3a1a78');
  ctx.fillStyle = bg; ctx.fill();
  ctx.clip();
  // 背景: 夕日と街のシルエット
  ctx.fillStyle = 'rgba(255,236,160,0.55)';
  ctx.beginPath(); ctx.arc(fx + fs * 0.5, fy + fs * 0.46, fs * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,6,40,0.5)';
  for (let i = 0; i < 8; i++) { const bw = fs * 0.1 + (i * 37) % 14, bh = fs * 0.18 + (i * 53) % (fs * 0.3); ctx.fillRect(fx + i * fs / 7 - 4, fy + fs - bh, bw, bh); }
  const line = win.lines?.[win.li] || '';
  const heroKey = meTalks ? heroArtKey(g) : null;
  const heroP = heroKey ? guard('portraitFor', () => SpriteM.portraitFor?.(heroKey, undefined, null), null) : null;
  let drew = false;
  if (heroP) {
    // 立ち絵の上の方（顔〜胸）を枠に合わせて切り出す
    drew = !!guard('heroPortrait', () => SpriteM.drawPortrait(ctx, heroKey, heroExprOf(win, line), fx + fs / 2, fy + fs, fs - 4, { maxW: fs + 20, crop: [0, 0, 1, Math.min(1, heroP.w / heroP.h)] }), null);
  }
  if (!drew) {
    // 頭と胸が枠いっぱいに入る大きさで描く（顔の中心 ≒ 足元から 58 単位上）
    const k = fs / 70, bob = Math.sin(t * 2) * 0.8;
    const look = meTalks ? charLook(g.state) : npc.look;
    const eq = meTalks ? equipLooks(g.state) : looksFrom(npc.equip);
    const cx = fx + fs * 0.5, cy = fy + fs * 0.52 + bob;
    guard('dlgFace', () => drawChar(ctx, cx - 5 * k, cy + 58 * k, look, eq, { facing: 1, state: 'idle', t, attackT: 0, damage: 0, scale: k }));
  }
  ctx.restore();
  ctx.save(); rrPath(ctx, fx, fy, fs, fs, 12); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke(); ctx.restore();
  // 肩書（顔の上端の帯）
  if (npc.title && !meTalks) {
    ctx.save();
    rrPath(ctx, fx + 6, fy + 6, fs - 12, s.fs + 4, 6);
    ctx.fillStyle = 'rgba(16,8,40,0.6)'; ctx.fill();
    ctx.restore();
    txt(ctx, npc.title, fx + fs / 2, fy + 6 + (s.fs + 4) / 2 + 0.5, { size: s.fs - 5, align: 'center', color: '#ffe7f3', maxW: fs - 20, sw: 2 });
  }
  // 名前の札
  const name = meTalks ? (guard('charName', () => charName(g.state), '') || 'あなた') : (npc.name || '???');
  const ny = fy + fs + 6;
  ctx.save();
  rrPath(ctx, fx, ny, fs, s.plate, 7);
  const ng = ctx.createLinearGradient(0, ny, 0, ny + s.plate);
  ng.addColorStop(0, '#2a2060'); ng.addColorStop(1, '#140c36');
  ctx.fillStyle = ng; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = meTalks ? COL.teal : COL.pink; ctx.stroke();
  ctx.restore();
  txt(ctx, name, fx + fs / 2, ny + s.plate / 2 + 1, { size: s.fs, align: 'center', maxW: fs - 14, sw: 3 });
}

/** 文字の並びを描く（runs ごと）。limit 文字まで。戻り値: 次の行の y */
function drawGlyphLines(ctx, lines, x, y, size, lh, limit = Infinity, base = INK) {
  let n = 0;
  ctx.save();
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    let xx = x, i = 0;
    while (i < line.length && n < limit) {
      const c = line[i].c, b = line[i].b;
      let j = i, str = '';
      while (j < line.length && line[j].c === c && line[j].b === b && n < limit) { str += line[j].ch; j++; n++; }
      ctx.font = `${b ? 900 : 700} ${size}px ${FONT}`;
      ctx.fillStyle = c ? RICH_COLORS[c] : base;
      ctx.fillText(str, xx, y);
      xx += ctx.measureText(str).width;
      i = j;
    }
    y += lh;
    if (n >= limit) break;
  }
  ctx.restore();
  return y;
}
function drawPage(ctx, win, x, y, s) {
  const page = win.pages?.[win.li];
  if (!page) return y;
  drawGlyphLines(ctx, page.lines, x, y, s.fs, s.lh, Math.floor(win.chars));
  return y - s.lh / 2 + page.lines.length * s.lh;
}

/** 項目の印（！ 受けられる / 時計 進行中 / ？ 報告できる / 用事） */
function drawMark(ctx, kind, cx, cy, r) {
  ctx.save();
  const C = { offer: '#ffb400', report: '#2fbf5a', active: '#8a8fb0', shop: '#19b8a8', job: '#b45cff', taxi: '#ffb400', content: '#3d8eff', talk: '#ff5fa2', choice: '#1f5fe8', cancel: '#9a90bb' }[kind] || '#1f5fe8';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = C; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  ctx.font = `900 ${Math.round(r * 1.45)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 'offer') ctx.fillText('!', cx, cy + 1);
  else if (kind === 'report') ctx.fillText('?', cx, cy + 1);
  else if (kind === 'active') {
    // 時計
    ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.42); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.32, cy + r * 0.12); ctx.stroke();
  } else if (kind === 'shop') {
    // 袋
    rrPath(ctx, cx - r * 0.5, cy - r * 0.2, r, r * 0.75, r * 0.15); ctx.fill();
    ctx.lineWidth = Math.max(1.4, r * 0.14); ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r * 0.3, Math.PI, 0); ctx.stroke();
  } else if (kind === 'job') ctx.fillText('★', cx, cy + 1);
  else if (kind === 'taxi') ctx.fillText('T', cx, cy + 1);
  else if (kind === 'content') ctx.fillText('▲', cx, cy);
  else if (kind === 'talk') { rrPath(ctx, cx - r * 0.55, cy - r * 0.42, r * 1.1, r * 0.72, r * 0.25); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - r * 0.2, cy + r * 0.25); ctx.lineTo(cx - r * 0.38, cy + r * 0.6); ctx.lineTo(cx + r * 0.05, cy + r * 0.28); ctx.fill(); }
  else if (kind === 'cancel') ctx.fillText('←', cx, cy + 1);
  ctx.restore();
}
function drawList(ui, ctx, win, L, y0) {
  const g = ui.game, s = L.s, opts = win.opts || [];
  const n = opts.length, vis = Math.min(n, s.rows);
  if (!n) return;
  // 選んでいる項目が見える位置まで送る
  win.scroll = clamp(win.scroll || 0, 0, Math.max(0, n - vis));
  if (win.optSel < win.scroll) win.scroll = win.optSel;
  if (win.optSel >= win.scroll + vis) win.scroll = win.optSel - vis + 1;
  const x0 = L.px + 10, rw = L.pw - 20;
  for (let k = 0; k < vis; k++) {
    const i = win.scroll + k, o = opts[i];
    const r = { x: x0, y: y0 + k * s.row, w: rw, h: s.row - 4 };
    const hov = ui.hover(win, r);
    if (hov) win.optSel = i;
    const on = win.optSel === i;
    if (on) {
      ctx.save();
      rrPath(ctx, r.x, r.y, r.w, r.h, 7);
      ctx.fillStyle = 'rgba(31,95,232,0.12)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(31,95,232,0.5)'; ctx.stroke();
      ctx.restore();
    }
    const cy = r.y + r.h / 2;
    const mr = Math.round(s.fs * 0.62);
    if (o.kind === 'choice') {
      // 番号
      ctx.save();
      ctx.beginPath(); ctx.arc(r.x + 8 + mr, cy, mr, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#1f5fe8' : '#6d8fe8'; ctx.fill();
      ctx.restore();
      txt(ctx, String(o.num), r.x + 8 + mr, cy + 1, { size: s.fs - 3, align: 'center', stroke: false });
    } else drawMark(ctx, o.kind, r.x + 8 + mr, cy, mr);
    const tx = r.x + 16 + mr * 2;
    const label = plainRich(o.text || o.label, g); // 項目は青い文字なので、強調の記号は外して出す
    const col = o.kind === 'cancel' ? '#7d7499' : (o.color || RICH_COLORS.b);
    const sub = o.sub || (o.hint ? plainRich(o.hint, g) : '');
    const subW = sub ? Math.min(rw * 0.42, measureW(ctx, sub, s.fs - 4) + 8) : 0;
    ctx.save();
    ctx.font = `${on ? 900 : 800} ${s.fs}px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    let str = String(label), maxW = rw - (tx - r.x) - subW - 14;
    while (str.length > 1 && ctx.measureText(str).width > maxW) str = str.slice(0, -1);
    if (str !== String(label)) str = str.slice(0, -1) + '…';
    ctx.fillText(str, tx, cy + 1);
    if (on) { const tw = ctx.measureText(str).width; ctx.fillRect(tx, cy + s.fs / 2 + 2, tw, 1.5); }
    ctx.restore();
    if (sub) txt(ctx, sub, r.x + r.w - 10, cy + 1, { size: s.fs - 4, align: 'right', color: o.kind === 'report' ? '#2a9a4a' : '#8a82a8', stroke: false, maxW: subW });
    ui.hit(win, 'opt' + i, r, { onClick: () => pick(ui, win, i) });
  }
  // 項目が多いときの送り
  if (n > vis) {
    const ay = y0 + vis * s.row + 8;
    const up = { x: L.px + L.pw / 2 - 70, y: ay - 9, w: 60, h: 20 }, dn = { x: L.px + L.pw / 2 + 10, y: ay - 9, w: 60, h: 20 };
    txt(ctx, '▲', up.x + 30, ay, { size: 13, align: 'center', color: win.scroll > 0 ? '#1f5fe8' : '#c9c2de', stroke: false });
    txt(ctx, '▼', dn.x + 30, ay, { size: 13, align: 'center', color: win.scroll < n - vis ? '#1f5fe8' : '#c9c2de', stroke: false });
    txt(ctx, `${win.optSel + 1}/${n}`, L.px + L.pw - 16, ay, { size: 11, align: 'right', color: '#9a90bb', stroke: false });
    ui.hit(win, 'scrollUp', up, { onClick: () => { win.optSel = Math.max(0, win.scroll - 1); win.scroll = win.optSel; } });
    ui.hit(win, 'scrollDn', dn, { onClick: () => { win.optSel = Math.min(n - 1, win.scroll + vis); } });
  }
}
function measureW(ctx, s, size) { ctx.save(); ctx.font = `700 ${size}px ${FONT}`; const w = ctx.measureText(s).width; ctx.restore(); return w; }

/** 見出しの札（「目的」「報酬」） */
function tag(ctx, label, x, y, color, s) {
  const w = measureW(ctx, label, s.fs - 3) + 18, h = s.fs + 6;
  ctx.save(); rrPath(ctx, x, y - h / 2, w, h, h / 2); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  txt(ctx, label, x + w / 2, y + 1, { size: s.fs - 3, align: 'center', stroke: false });
  return w;
}
/** 報酬のアイコン（経験値・お金・アイテム）。pop: 0..1 で出る演出 */
const CHIP = 52, CHIP_GAP = 26;
function drawChips(ui, ctx, win, list, x, y, s, popOf) {
  const g = ui.game, cs = CHIP, gap = CHIP_GAP;
  list.slice(0, 8).forEach((c, i) => {
    const k = popOf ? popOf(i) : 1;
    if (k <= 0) return;
    const cx = x + i * (cs + gap) + cs / 2, cy = y + cs / 2;
    const sc = k < 1 ? 0.4 + 0.6 * k + Math.sin(k * Math.PI) * 0.25 : 1;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    ctx.globalAlpha *= Math.min(1, k * 1.6);
    const r = { x: cx - cs / 2, y, w: cs, h: cs };
    rrPath(ctx, r.x, r.y, r.w, r.h, 9);
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (c.kind === 'exp') { bg.addColorStop(0, '#b67cff'); bg.addColorStop(1, '#6a2fd0'); }
    else if (c.kind === 'money') { bg.addColorStop(0, '#9dffb8'); bg.addColorStop(1, '#2fae5c'); }
    else if (c.kind === 'sp') { bg.addColorStop(0, '#7fd8ff'); bg.addColorStop(1, '#2f7fd0'); }
    else { bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#e6def8'); }
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = c.kind === 'item' && c.it?.rarity && c.it.rarity !== 'common' ? (guard('rar', () => ({ rare: '#4FA8FF', epic: '#B45CFF', legendary: '#FFC93C', mythic: '#FF4FA0', pet: '#FF6AD5' })[c.it.rarity], null) || '#b9a8e8') : 'rgba(255,255,255,0.95)';
    ctx.stroke();
    if (c.kind === 'exp') txt(ctx, 'EXP', cx, cy, { size: 16, align: 'center', color: '#fff', sw: 3, stroke: '#3b1680' });
    else if (c.kind === 'money') guard('cash', () => drawItemIco(ctx, { icon: 'cash', name: '$' }, cx, cy, 38));
    else if (c.kind === 'sp') txt(ctx, 'SP', cx, cy, { size: 18, align: 'center', color: '#fff', sw: 3, stroke: '#123a70' });
    else guard('ico', () => drawItemIco(ctx, c.it, cx, cy, 40));
    if (c.kind === 'item' && c.label) txt(ctx, c.label, r.x + r.w - 4, r.y + r.h - 9, { size: 12, align: 'right', color: '#fff', sw: 3 });
    ctx.restore();
    // 下の文字（数・名前）
    if (k >= 0.5) {
      const lab = c.kind === 'exp' ? c.shown ?? c.label : c.kind === 'item' ? c.it.name : c.label;
      txt(ctx, lab, cx, y + cs + 11, { size: 12, align: 'center', color: c.kind === 'money' ? '#138a4a' : c.kind === 'exp' ? '#6a2fd0' : INK, stroke: false, maxW: cs + gap - 8 });
    }
    const hr = { x: cx - cs / 2, y, w: cs, h: cs + 18 };
    if (c.kind === 'item' && ui.hover(win, hr)) ui.setTip(itemTip(g, c.it));
  });
}

/** 受注の窓（クエスト名・目的・報酬） */
function drawCard(ui, ctx, win, L) {
  const g = ui.game, s = L.s, { m, kind } = win.card;
  const x0 = L.px + 18, w0 = L.pw - 36;
  let y = L.py + 14 + 15;
  // 種類の札＋クエスト名
  const cat = m.type === 'job' ? CAT.job : (CAT[m.category] || CAT.sub);
  const cw = tag(ctx, cat[0], x0, y, cat[1], s);
  ctx.save();
  ctx.font = `900 ${s.fs + 3}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a1e5c';
  ctx.fillText(m.name || m.id, x0 + cw + 10, y + 1);
  ctx.restore();
  txt(ctx, kind === 'active' ? '進行中' : `推奨 Lv.${m.reqLevel || 1}`, x0 + w0, y + 1, { size: s.fs - 4, align: 'right', color: kind === 'active' ? '#e07a00' : '#8a82a8', stroke: false });
  y += 30;
  if (m.desc) {
    const dl = wrapRich(parseRich(m.desc, g), w0, s.fs - 1).slice(0, 2);
    drawGlyphLines(ctx, dl, x0, y, s.fs - 1, s.lh - 6, Infinity, '#5a5078');
    y += dl.length * (s.lh - 6);
  }
  y += 10;
  // 目的
  tag(ctx, '目的', x0, y, '#e02648', s);
  y += 24;
  const vals = kind === 'active' ? (guard('objValues', () => g.missions?.objectiveValues?.(m.id), null) || []) : null;
  (m.objectives || []).slice(0, 4).forEach((o, i) => {
    const gl = wrapRich(parseRich(objLine(g, o), g), w0 - 110, s.fs)[0] || [];
    ctx.save(); ctx.fillStyle = '#e02648'; ctx.beginPath(); ctx.arc(x0 + 6, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    drawGlyphLines(ctx, [gl], x0 + 16, y, s.fs, s.lh);
    let right = '';
    if (vals && o.type !== 'reach' && o.type !== 'talk') right = `${Math.min(o.count || 1, vals[i] || 0)} / ${o.count || 1}`;
    else if (o.mapId && o.type !== 'reach') right = guard('mapInfo', () => mapInfo(o.mapId)?.name, '') || '';
    if (right) txt(ctx, right, x0 + w0, y + 1, { size: s.fs - 4, align: 'right', color: vals ? ((vals[i] || 0) >= (o.count || 1) ? '#2a9a4a' : '#e07a00') : RICH_COLORS.g, stroke: false, maxW: 104 });
    y += s.lh - 2;
  });
  y += 10;
  // 報酬
  tag(ctx, '報酬', x0, y, '#e0a000', s);
  y += 16;
  drawChips(ui, ctx, win, rewardList(m.reward || {}), x0, y, s, null);
}

/** 報告の報酬（アイコンが順に出る短い演出） */
function drawReward(ui, ctx, win, L) {
  const s = L.s, { m, rw } = win.reward;
  const at = (win.t || 0) - (win.modeT || 0);
  const x0 = L.px + 18, w0 = L.pw - 36;
  let y = L.py + 14 + 20;
  // 見出し（ぽんと出る）
  const k0 = clamp(at / 0.25, 0, 1), sc = 0.6 + 0.4 * k0 + Math.sin(k0 * Math.PI) * 0.15;
  ctx.save();
  ctx.translate(x0 + w0 / 2, y); ctx.scale(sc, sc);
  txt(ctx, '★ クエスト完了 ★', 0, 0, { size: s.fs + 8, align: 'center', color: '#ffd447', stroke: '#7a3a00', sw: 5, glow: '#ff8a3d', alpha: k0 });
  ctx.restore();
  // きらめき（最初の 1.2 秒）
  if (at < 1.4) {
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + at * 2, rr = 40 + at * 120;
      const sx = x0 + w0 / 2 + Math.cos(a) * rr * 1.8, sy = y + Math.sin(a) * rr * 0.35;
      ctx.globalAlpha = clamp(1 - at / 1.4, 0, 1);
      ctx.fillStyle = i % 2 ? '#ffd447' : '#ff8ac0';
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  y += 34;
  ctx.save();
  ctx.font = `900 ${s.fs + 1}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a1e5c';
  ctx.fillText(m.name || '', x0 + w0 / 2, y);
  ctx.restore();
  y += 26;
  txt(ctx, '報酬を受け取った！', x0, y, { size: s.fs - 2, color: '#5a5078', stroke: false });
  y += 14;
  const list = rewardList(rw || {});
  const cs = CHIP, gap = CHIP_GAP, tot = Math.min(8, list.length) * (cs + gap) - gap;
  const cx0 = x0 + Math.max(0, (w0 - tot) / 2);
  // EXP の数を数え上げる
  for (const c of list) if (c.kind === 'exp') c.shown = Math.floor(c.n * clamp((at - 0.25) / 0.6, 0, 1)).toLocaleString('en-US');
  // 後ろの光
  if (at < 1.2 && list.length) {
    ctx.save();
    const gx = cx0 + tot / 2, gy = y + cs / 2;
    const rg = ctx.createRadialGradient(gx, gy, 4, gx, gy, tot / 2 + 40);
    rg.addColorStop(0, `rgba(255,212,71,${0.45 * (1 - at / 1.2)})`); rg.addColorStop(1, 'rgba(255,212,71,0)');
    ctx.fillStyle = rg; ctx.fillRect(gx - tot / 2 - 50, gy - 60, tot + 100, 120);
    ctx.restore();
  }
  drawChips(ui, ctx, win, list, cx0, y, s, (i) => clamp((at - 0.25 - i * 0.12) / 0.22, 0, 1));
}

/** 下のボタンの並び（MapleStory の形: 左に「会話を終える」、右に 前へ / 次へ / はい / いいえ など） */
function drawButtons(ui, ctx, win, L) {
  const s = L.s, by = win.y + win.h - 14 - s.btnH;
  const shown = optsShown(win);
  mbtn(ui, ctx, win, 'end', { x: L.fx, y: by, w: Math.max(s.face, s.btnW), h: s.btnH }, '会話を終える', () => ui.close('dialog'), {});
  const right = [];
  if (win.mode === 'quest' || win.mode === 'reward') {
    if (shown) (win.opts || []).forEach((o, i) => right.push({ id: 'opt' + i, label: o.label, fn: () => pick(ui, win, i), primary: o.primary, sel: win.optSel === i }));
  } else {
    if (win.li > 0) right.push({ id: 'prev', label: '前へ', fn: () => back(win) });
    const listLast = win.mode === 'list' && lastPage(win);
    if (!listLast) right.push({ id: 'next', label: lastPage(win) && !win.after && win.mode === 'talk' ? 'OK' : '次へ', fn: () => advance(ui, win), primary: true, sel: true });
  }
  let rx = L.px + L.pw;
  for (let i = right.length - 1; i >= 0; i--) {
    const b = right[i];
    rx -= s.btnW;
    mbtn(ui, ctx, win, b.id === 'next' || b.id === 'prev' ? b.id : 'b' + b.id, { x: rx, y: by, w: s.btnW, h: s.btnH }, b.label, b.fn, b);
    rx -= 10;
  }
  // キーの案内
  if (!isTouch()) {
    const hint = shown && win.opts?.length ? '↑↓ 選ぶ　Enter 決める　Esc 閉じる' : 'Enter / Space 次へ　Esc 閉じる';
    txt(ctx, hint, L.fx + Math.max(s.face, s.btnW) + 16, by + s.btnH / 2 + 1, { size: 11, color: '#bdb4e8', sw: 2 });
  }
}
function mbtn(ui, ctx, win, id, r, label, fn, o = {}) {
  const hov = ui.hover(win, r);
  const base = o.primary ? '#ffb02e' : '#9b8cd8';
  ctx.save();
  if (o.sel || hov) { ctx.shadowColor = o.primary ? '#ffd447' : '#ffffff'; ctx.shadowBlur = hov ? 14 : 8; }
  rrPath(ctx, r.x, r.y, r.w, r.h, Math.min(10, r.h / 2));
  const gr = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  gr.addColorStop(0, hov ? '#ffffff' : lighten(base, 0.45)); gr.addColorStop(0.5, lighten(base, 0.1)); gr.addColorStop(1, darken(base, 0.18));
  ctx.fillStyle = gr; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = o.sel ? 2.5 : 1.5; ctx.strokeStyle = o.sel ? '#ffffff' : 'rgba(255,255,255,0.8)'; ctx.stroke();
  ctx.restore();
  txt(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: Math.round(r.h * 0.42), align: 'center', color: o.primary ? '#4a2200' : '#1c1440', stroke: 'rgba(255,255,255,0.6)', sw: 2, maxW: r.w - 10 });
  ui.hit(win, id, r, { onClick: fn });
  void rgba;
}
