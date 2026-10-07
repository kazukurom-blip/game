// ルミナリア・クラシック 試遊版（ブラウザ）。C# の Core を WebAssembly で動かし、JS は入力・描画・音・窓だけ。
// 流れは classic-unity/Unity/GameRunner.cs と同じ: 入力を集める → Frame(dt, 入力) → 出てきた物を描く・鳴らす。
import { dotnet } from './_framework/dotnet.js';
import { Renderer, VIEW_W, VIEW_H } from './js/render.js';
import { Ui, QUICK_KEYS } from './js/ui.js';
import { Audio } from './js/audio.js';

const SLOT = 'char1';
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const status = (t) => { $('loadmsg').textContent = t; };

// ---------------------------------------------------------------- 入力（キー → Core の PlayerInput のビット）
const K = { Left: 1, Right: 2, Up: 4, Down: 8, Jump: 16, Attack: 32, Pickup: 64, JumpPressed: 128, UpPressed: 256, Interact: 512 };
const HOLD = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  AltLeft: 'Jump', AltRight: 'Jump', Space: 'Jump', KeyC: 'Jump',
  ControlLeft: 'Attack', ControlRight: 'Attack', KeyX: 'Attack',
  KeyZ: 'Pickup',
};
const QUICK_CODES = ['ShiftLeft|ShiftRight', 'KeyA', 'KeyD', 'KeyF', 'KeyG', 'KeyV', 'KeyB', 'KeyY', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
const quickOf = (code) => QUICK_CODES.findIndex((c) => c.split('|').includes(code));
const WIN_KEYS = { KeyI: 'inv', KeyE: 'equip', KeyS: 'stat', KeyK: 'skill', KeyQ: 'quest', KeyO: 'opt' };

class Input {
  constructor() {
    this.held = new Set();
    this.edges = { jump: false, up: false, interact: false, quick: [] };
    this.enabled = true;
  }
  down(code, repeat) {
    if (!repeat) {
      if (HOLD[code] === 'Jump') this.edges.jump = true;
      if (code === 'ArrowUp') this.edges.up = true;
      if (code === 'Enter' || code === 'NumpadEnter') this.edges.interact = true;
      const q = quickOf(code);
      if (q >= 0) this.edges.quick.push(q);
    }
    this.held.add(code);
  }
  up(code) { this.held.delete(code); }
  clear() { this.held.clear(); }
  bits() {
    let b = 0;
    for (const c of this.held) if (HOLD[c]) b |= K[HOLD[c]];
    if (this.edges.jump) b |= K.JumpPressed;
    if (this.edges.up) b |= K.UpPressed;
    if (this.edges.interact) b |= K.Interact;
    return b;
  }
  heldQuick() { for (const c of this.held) { const q = quickOf(c); if (q >= 0) return q; } return -1; }
  reset() { this.edges = { jump: false, up: false, interact: false, quick: [] }; }
}

// ---------------------------------------------------------------- ゲーム
class Game {
  constructor(api, data, manifest, sfx) {
    this.api = api;
    this.data = data;
    const parse = (p, key) => { const o = {}; for (const x of JSON.parse(data[p])[key]) o[x.id] = x; return o; };
    this.db = { items: parse('items.json', 'items'), monsters: parse('monsters.json', 'monsters'), skills: parse('skills.json', 'skills'), npcs: parse('npcs.json', 'npcs') };
    this.maps = new Map();
    this.audio = new Audio(manifest, sfx, this.db);
    this.input = new Input();
    this.canvas = $('view');
    this.renderer = new Renderer(this.canvas, this.db);
    this.ui = new Ui($('ui'), this);
    this.ui.root.addEventListener('input', (e) => this.ui.onVolume(e));
    this.ui.root.addEventListener('change', (e) => this.ui.onVolume(e));
    this.mapId = null;
    this.frameNo = 0;
    this.perf = { frame: [], render: [], total: [], worst: 0 };
    this.errors = [];
    this.last = performance.now();
    this.paused = false;
    this.fitScreen();
    addEventListener('resize', () => this.fitScreen());
    this.bindKeys();
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    addEventListener('beforeunload', () => { try { this.act('save', 'quit'); } catch { /* */ } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { try { this.act('save', 'pause'); } catch { /* */ } } });
  }

  fitScreen() {
    this.scale = fitStage();
    this.renderer.resize(this.scale);
  }

  bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')) return;
      this.audio.unlock();
      const c = e.code;
      if (c === 'F5' || c === 'F12' || (e.ctrlKey && (c === 'KeyR' || c === 'KeyW'))) return;
      e.preventDefault();
      if (!e.repeat) {
        if (c === 'Escape') { this.ui.closeTop(); return; }
        if (WIN_KEYS[c]) { this.ui.toggle(WIN_KEYS[c]); return; }
        if (c === 'KeyH') { this.ui.toggleKeys(); return; }
        if (c === 'KeyM') { this.hideMinimap = !this.hideMinimap; return; }
      }
      this.input.down(c, e.repeat);
    });
    addEventListener('keyup', (e) => { this.input.up(e.code); if (e.key === 'Alt') e.preventDefault(); });
    addEventListener('blur', () => this.input.clear());
  }

  mapData(id) {
    let m = this.maps.get(id);
    if (!m) { const t = this.data['maps/' + id + '.json']; if (!t) return null; m = JSON.parse(t); this.maps.set(id, m); }
    return m;
  }
  mapName(id, quiet) { const m = this.mapData(id); return m ? m.name : (quiet ? null : id); }

  act(cmd, a = '', b = '', n = 0) {
    const r = JSON.parse(this.api.Act(cmd, String(a ?? ''), String(b ?? ''), n | 0));
    if (r.trace) console.warn(r.trace);
    return r;
  }

  pressQuick(i) { this.input.edges.quick.push(i); }

  sys(name) {
    if (name === 'reload') { const r = JSON.parse(this.api.Boot(SLOT, '', Date.now())); this.ui.msg(r.msg); this.mapId = null; this.ui.refresh(true); }
    if (name === 'newgame') { this.ui.confirmNew = true; this.ui.renderWins(); }
    if (name === 'newgameYes') {
      this.ui.confirmNew = false;
      const r = JSON.parse(this.api.NewGame(SLOT, this.ui.state?.name || 'ぼうけんしゃ', Date.now())); this.ui.msg(r.msg); this.mapId = null; this.ui.refresh(true);
    }
    if (name === 'newgameNo') { this.ui.confirmNew = false; this.ui.renderWins(); }
    if (name === 'export') {
      // ダウンロードはできない場所でも動くよう、クリップボードにコピーする
      const text = this.api.ExportSave();
      navigator.clipboard?.writeText(text).then(() => this.ui.msg('セーブ（JSON）をコピーした'), () => this.ui.msg('コピーできなかった', 'bad'));
    }
    if (name === 'keys') this.ui.toggleKeys();
  }

  onCanvasClick(e) {
    this.audio.unlock();
    if (!this.map || !this.lastFrame) return;
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / this.scale + Math.round(this.renderer.cam.x);
    const y = (e.clientY - r.top) / this.scale + Math.round(this.renderer.cam.y);
    for (const n of this.map.npcs) {
      if (Math.abs(x - n.x) < 18 && y < n.y + 16 && y > n.y - 64) {
        const res = this.act('talk', n.id);
        if (res.dialog) this.ui.openDialog(res.dialog);
        return;
      }
    }
  }

  // 1 フレーム
  tick(now) {
    let dt = (now - this.last) / 1000; this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.25);
    const t0 = performance.now();
    // クイックスロット
    const st = this.ui.state;
    let skill = '', item = '', held = '';
    for (const q of this.input.edges.quick) {
      const s = st?.quick[q];
      if (!s) continue;
      if (s.kind === 'skill') skill = s.id; else item = s.id;
    }
    const hq = this.input.heldQuick();
    if (hq >= 0 && st?.quick[hq]?.kind === 'skill') held = st.quick[hq].id;
    const json = this.api.Frame(dt, this.input.bits(), skill, item, held);
    this.input.reset();
    const t1 = performance.now();
    const f = JSON.parse(json);
    if (f.error) { this.errors.push(f.error); console.error(f.error); return; }
    this.lastFrame = f;
    if (f.m !== this.mapId) this.enterMap(f);
    this.handleEvents(f);
    this.audio.weapon = st?.stats?.weapon || '素手';
    this.audio.onFrame(f, dt);
    this.ui.hud(f);
    const t2 = performance.now();
    this.renderer.draw(f, dt, { weaponType: st?.stats?.weapon, hideMinimap: this.hideMinimap });
    const t3 = performance.now();
    this.frameNo++;
    if (this.frameNo % 20 === 0) this.ui.refresh(false);
    if (this.frameNo % 30 === 0) this.ui.drawMsgs();
    const P = this.perf;
    P.frame.push(t1 - t0); P.render.push(t3 - t2); P.total.push(t3 - t0);
    if (P.total.length > 600) { P.frame.shift(); P.render.shift(); P.total.shift(); }
    if (this.frameNo > 60) P.worst = Math.max(P.worst, t3 - t0);
    if (this.frameNo % 60 === 0) {
      const pf = $('perf');
      if (pf) pf.textContent = `1 フレーム: Core ${avg(P.frame).toFixed(2)} ms・描画 ${avg(P.render).toFixed(2)} ms`;
    }
  }

  enterMap(f) {
    this.mapId = f.m;
    this.map = this.mapData(f.m);
    this.renderer.setMap(this.map, f.p[0], f.p[1]);
    this.audio.playBgm(this.map.bgm);
    this.ui.toast(this.map.name);
    this.ui.refresh(this.ui.open.size > 0);
  }

  handleEvents(f) {
    let dirty = false;
    const U = this.ui;
    for (const e of f.ev) {
      const [type, id, value, x, y, text] = e;
      switch (type) {
        case 'ItemPicked': U.msg(`${text || U.itemName(id)}を手に入れた${value > 1 ? ' ×' + value : ''}`, 'item'); dirty = true; break;
        case 'MesoPicked': U.msg(`お金 +${value} ルド`, 'item'); dirty = true; break;
        case 'ExpGained': if (value > 0) U.msg(`経験値 +${value}`, 'exp'); break;
        case 'LevelUp': U.msg(`Lv ${value} になった！ AP +5`, 'big'); this.renderer.addFx('level', x, y, 'LEVEL UP'); dirty = true; break;
        case 'JobAdvanced': U.msg(`${text} に転職した！`, 'big'); this.renderer.addFx('job', f.p[0], f.p[1], text); dirty = true; break;
        case 'QuestStarted': U.msg(`クエスト「${text}」を受けた`, 'quest'); dirty = true; break;
        case 'QuestCompleted': U.msg(`クエスト「${text}」完了！ 経験値 +${value}`, 'quest'); dirty = true; break;
        case 'QuestProgress': { const q = this.db.quests?.[id]; U.msg(`クエストの進み ${text}`, 'quest'); dirty = true; break; }
        case 'Message': case 'SkillFailed': case 'InventoryFull': case 'Revived': case 'RoomTimeUp': case 'RoomFailed':
          if (text) U.msg(text, type === 'Message' ? '' : 'bad'); break;
        case 'Died': U.msg('倒れてしまった…', 'bad'); break;
        case 'Saved': if (id === 'manual') U.msg('セーブした'); break;
        case 'SaveFailed': U.msg('セーブできなかった: ' + (text || ''), 'bad'); break;
        case 'StatusApplied': if (value === 0) U.msg(`${text}になった`, 'bad'); break;
        case 'BuffStarted': dirty = true; break;
        case 'RoomEntered': U.msg(`制限時間 ${Math.round(value / 60)} 分${text ? '（' + text + '）' : ''}`); break;
        case 'BossPhase': U.toast(text || '段階が変わった'); break;
        case 'BossKilled': case 'DungeonCleared': U.toast('撃破！'); break;
        case 'EquipChanged': case 'ApChanged': case 'SpChanged': case 'ItemUsed': case 'ItemBought': case 'ItemSold': case 'ScrollResult':
          dirty = true; if (type === 'ScrollResult' && text) U.msg(text); break;
        case 'Healed': if (text) U.msg(text); break;
      }
    }
    if (dirty) { U.refresh(false); if (U.open.size && !document.activeElement?.matches?.('input')) U.renderWins(); }
  }
}

// 画面を整数倍に拡大する（ドットがぼけない）
function fitStage() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  $('ui').style.transform = `scale(${s})`;
  $('stage').style.width = VIEW_W * s + 'px'; $('stage').style.height = VIEW_H * s + 'px';
  $('view').style.width = VIEW_W * s + 'px'; $('view').style.height = VIEW_H * s + 'px';
  return s;
}

const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

// ---------------------------------------------------------------- 起動
async function main() {
  fitStage();
  addEventListener('resize', fitStage);
  status('データを読んでいます…');
  const [data, manifest, sfx] = await Promise.all([
    fetch('data.json').then((r) => r.json()),
    fetch('audio/audio_manifest.json').then((r) => r.json()).catch(() => ({ bgm: {}, jingle: {}, sfx: {}, events: { sfx: {}, jingle: {} } })),
    fetch('sfx.json').then((r) => r.json()).catch(() => ({})),
  ]);
  status('C# のゲーム本体（WebAssembly）を起こしています…');
  const runtime = await dotnet.create();
  runtime.setModuleImports('lumina', {
    dataText: (p) => data[p] ?? null,
    storeGet: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    storeSet: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    storeDel: (k) => { try { localStorage.removeItem(k); } catch { /* */ } },
  });
  const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
  const api = exports.Lumina.Web.Program;
  await runtime.runMain(runtime.getConfig().mainAssemblyName, []);

  let hasSave = false;
  try { hasSave = Object.keys(localStorage).some((k) => k.startsWith('lumina.saves/' + SLOT + '.json')); } catch { /* */ }
  $('loadmsg').textContent = '';
  $('start').hidden = false;
  $('btnCont').style.display = hasSave ? '' : 'none';
  const begin = (fresh) => {
    const name = $('name').value.trim() || 'ぼうけんしゃ';
    const r = JSON.parse(fresh ? api.NewGame(SLOT, name, Date.now()) : api.Boot(SLOT, name, Date.now()));
    if (!r.ok) { status('始められなかった: ' + r.msg); console.error(r.msg); return; }
    $('title').style.display = 'none';
    const game = new Game(api, data, manifest, sfx);
    window.game = game;
    game.audio.unlock();
    game.ui.refresh(false);
    game.ui.msg(r.msg);
    game.ui.msg('← → で歩き、Alt / Space でジャンプ。案内人に Enter で話しかけよう。');
    const loop = (t) => {
      try { game.tick(t); } catch (err) { game.errors.push(String(err && err.stack || err)); console.error(err); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  $('btnNew').onclick = () => { if (hasSave) { $('confirmNew').hidden = false; return; } begin(true); };
  $('btnNewYes').onclick = () => begin(true);
  $('btnNewNo').onclick = () => { $('confirmNew').hidden = true; };
  $('btnCont').onclick = () => begin(false);
  if (params.has('autostart')) begin(params.get('autostart') === 'new');
}

main().catch((e) => { status('起動できなかった: ' + e); console.error(e); });
