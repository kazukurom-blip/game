// HUD と窓（DOM。800×600 の座標で置き、canvas と同じ倍率で拡大する）。
// 中身は C# の GetUi()（能力値・持ち物・装備・スキル・クエスト・クイックスロット）と会話（Dialog）を読むだけ。
// 操作は game.act(cmd, a, b, n) → C# の Actions.Run。
import { itemColor } from './render.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('ja-JP');
const TABS = ['装備', '消費', '設置', 'その他', '特別'];
const SLOT_NAMES = { cap: '帽子', face: '顔飾り', eye: '目飾り', earring: '耳飾り', top: '上着', bottom: '下衣', overall: '全身', shoes: '靴', gloves: '手袋', cape: 'マント', shield: '盾', weapon: '武器', ring1: '指輪1', ring2: '指輪2', pendant: '首飾り' };
const STAT_NAMES = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', hp: 'HP', mp: 'MP', watk: '攻撃力', matk: '魔力', wdef: '防御', mdef: '魔防', acc: '命中', avoid: '回避', speed: '速さ', jump: 'ジャンプ' };
const LINE_NAMES = { warrior: '戦士', magician: '魔法使い', bowman: '弓使い', thief: '盗賊', pirate: '海賊' };
const OBJ_TYPES = { Kill: '倒す', Collect: '集める', Talk: '話す', Visit: '行く', Interact: '調べる', Event: 'する' };

export const QUICK_KEYS = ['Shift', 'A', 'D', 'F', 'G', 'V', 'B', 'Y', '1', '2', '3', '4', '5', '6', '7', '8'];

export class Ui {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.db = game.db;
    this.state = null;      // GetUi の結果
    this.open = new Set();
    this.invTab = 0; this.invSel = -1;
    this.skillTier = 0; this.skillSel = null;
    this.dialog = null; this.dialogQuest = null; this.dialogMsg = '';
    this.shop = null; this.shopTab = 1; this.storageNpc = null;
    this.picker = null;     // クイックスロットに置く物
    this.msgs = [];
    this.build();
  }

  el(id) { return this.root.querySelector('#' + id); }

  build() {
    this.root.innerHTML = `
      <div id="msgs"></div>
      <div id="toast"></div>
      <div id="buffs"></div>
      <div id="keys" class="panel"></div>
      <div id="hud">
        <div class="who"><div class="lv">Lv<b id="hLv">1</b></div><div><div id="hJob" class="job"></div><div id="hName" class="name"></div></div></div>
        <div class="bars">
          <div class="bar hp"><i id="hHpB"></i><span id="hHp"></span><label>HP</label></div>
          <div class="bar mp"><i id="hMpB"></i><span id="hMp"></span><label>MP</label></div>
          <div class="bar ex"><i id="hExB"></i><span id="hEx"></span><label>EXP</label></div>
        </div>
        <div id="quick"></div>
        <div class="menu">
          <button data-win="inv" title="持ち物 (I)">持</button><button data-win="equip" title="装備 (E)">装</button><button data-win="stat" title="能力値 (S)">能</button>
          <button data-win="skill" title="スキル (K)">技</button><button data-win="quest" title="クエスト (Q)">ク</button><button data-win="opt" title="設定・セーブ (O)">設</button>
        </div>
      </div>
      <div id="wins"></div>
      <div id="modal"></div>`;
    this.el('keys').innerHTML = `<b>キー</b> <small>(H で隠す)</small><br>
      ←→ 歩く / ↑ はしご・縄・ポータル / ↓ 伏せ・下りる<br>
      Alt・Space・C ジャンプ（↓+ジャンプで下へ）<br>
      Ctrl・X 攻撃 / Z 拾う / Enter 話す・調べる<br>
      クイック: Shift A D F G V B Y ・ 1〜8<br>
      I 持ち物 E 装備 S 能力値 K スキル Q クエスト<br>
      O 設定・セーブ / M ミニマップ / Esc 閉じる<br>
      NPC はクリックでも話せる`;
    const q = this.el('quick');
    q.innerHTML = QUICK_KEYS.map((k, i) => `<div class="qs" data-q="${i}"><em>${k}</em><span></span><small></small></div>`).join('');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('contextmenu', (e) => {
      const qs = e.target.closest('.qs');
      if (qs) { e.preventDefault(); this.game.act('quick', '', '', +qs.dataset.q); this.refresh(); }
    });
    this.root.addEventListener('keydown', (e) => e.stopPropagation()); // 窓の中の入力欄
    try { if (localStorage.getItem('lumina.keysHidden') === '1') this.el('keys').style.display = 'none'; } catch { /* */ }
  }

  toggleKeys() {
    const k = this.el('keys');
    k.style.display = k.style.display === 'none' ? '' : 'none';
    try { localStorage.setItem('lumina.keysHidden', k.style.display === 'none' ? '1' : '0'); } catch { /* */ }
  }

  // ---------------- 名前
  itemName(id) { return this.db.items[id]?.name || id; }
  skillName(id) { return this.db.skills[id]?.name || id; }
  mapName(id) { return this.game.mapName(id); }
  short(name) { return (name || '').replace(/^(赤|青|白|黄)?/, '$1').slice(0, 3); }

  // ---------------- 毎フレーム（HUD）
  hud(f) {
    const h = f.h;
    this.el('hLv').textContent = h[6];
    this.el('hJob').textContent = f.j;
    if (this.state) this.el('hName').textContent = this.state.name;
    const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? a / b * 100 : 0));
    this.el('hHpB').style.width = pct(h[0], h[1]) + '%'; this.el('hHp').textContent = `${h[0]} / ${h[1]}`;
    this.el('hMpB').style.width = pct(h[2], h[3]) + '%'; this.el('hMp').textContent = `${h[2]} / ${h[3]}`;
    this.el('hExB').style.width = pct(h[4], h[5]) + '%'; this.el('hEx').textContent = `${h[4]} / ${h[5]} (${pct(h[4], h[5]).toFixed(2)}%)`;
    this.el('hHpB').parentElement.classList.toggle('low', h[1] > 0 && h[0] / h[1] <= 0.2);
    // 倒れた
    if (f.p[6] && !this.deadShown) this.showDead();
    if (!f.p[6] && this.deadShown) { this.deadShown = false; this.el('modal').innerHTML = ''; }
    if (f.qz) this.showQuiz(f.qz); else if (this.quizShown) { this.quizShown = null; if (!this.deadShown) this.el('modal').innerHTML = ''; }
    if (f.dl) this.openDialog(f.dl);
  }

  quickHud() {
    const s = this.state; if (!s) return;
    this.root.querySelectorAll('.qs').forEach((el, i) => {
      const q = s.quick[i];
      const span = el.querySelector('span'), small = el.querySelector('small');
      if (!q) { span.textContent = ''; small.textContent = ''; el.style.background = ''; el.title = ''; el.classList.remove('cd'); return; }
      if (q.kind === 'item') {
        const it = this.db.items[q.id];
        span.textContent = this.short(it?.name); small.textContent = q.n; el.style.background = itemColor(it); el.title = it?.name || q.id;
        el.classList.toggle('cd', q.n <= 0);
      } else {
        span.textContent = this.short(this.skillName(q.id)); small.textContent = q.cd > 0 ? q.cd.toFixed(0) : ''; el.style.background = '#6a5acd'; el.title = this.skillName(q.id);
        el.classList.toggle('cd', q.cd > 0 || q.lv <= 0);
      }
    });
  }

  setState(s) {
    this.state = s;
    this.quickHud();
    // かかっている強化（右上）
    const b = this.el('buffs');
    const html = (s.buffs || []).map((x) => `<div class="buff${x.rem < 5 ? ' end' : ''}" title="${esc(x.name || x.id)}"><span>${esc(this.short(x.name || this.skillName(x.id) || this.itemName(x.id)))}</span><small>${Math.ceil(x.rem)}</small></div>`).join('');
    if (b.innerHTML !== html) b.innerHTML = html;
  }

  // ---------------- メッセージ
  msg(text, cls = '') {
    if (!text) return;
    this.msgs.push({ text, cls, t: performance.now() });
    if (this.msgs.length > 7) this.msgs.shift();
    this.drawMsgs();
  }
  drawMsgs() {
    const now = performance.now();
    this.msgs = this.msgs.filter((m) => now - m.t < 9000);
    this.el('msgs').innerHTML = this.msgs.map((m) => `<div class="${m.cls}">${esc(m.text)}</div>`).join('');
  }
  toast(text) {
    const t = this.el('toast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }

  // ---------------- 窓
  toggle(name) {
    if (this.open.has(name)) this.close(name); else { this.open.add(name); this.game.audio.sfx('ui_open'); this.refresh(true); }
  }
  close(name) {
    if (!this.open.delete(name)) return false;
    if (name === 'dialog') { this.dialog = null; this.dialogQuest = null; }
    if (name === 'shop') this.shop = null;
    if (name === 'storage') this.storageNpc = null;
    this.game.audio.sfx('ui_close');
    this.renderWins();
    return true;
  }
  closeTop() {
    if (this.picker) { this.picker = null; this.renderWins(); return true; }
    const order = ['dialog', 'shop', 'storage', 'opt', 'quest', 'skill', 'stat', 'equip', 'inv'];
    for (const n of order) if (this.close(n)) return true;
    return false;
  }

  // render = true の時だけ窓を描き直す（入力欄・つまみを触っている途中に消さないため、ふだんは HUD だけ）
  refresh(render) {
    this.setState(JSON.parse(this.game.api.GetUi()));
    if (render) this.renderWins();
  }

  renderWins() {
    const s = this.state; if (!s) return;
    const parts = [];
    if (this.open.has('inv')) parts.push(this.winInv(s));
    if (this.open.has('equip')) parts.push(this.winEquip(s));
    if (this.open.has('stat')) parts.push(this.winStat(s));
    if (this.open.has('skill')) parts.push(this.winSkill(s));
    if (this.open.has('quest')) parts.push(this.winQuest(s));
    if (this.open.has('opt')) parts.push(this.winOpt(s));
    if (this.open.has('dialog') && this.dialog) parts.push(this.winDialog(s));
    if (this.open.has('shop') && this.shop) parts.push(this.winShop(s));
    if (this.open.has('storage') && this.storageNpc) parts.push(this.winStorage(s));
    if (this.picker) parts.push(this.winPicker(s));
    const w = this.el('wins');
    const scrolls = {};
    w.querySelectorAll('.win .body').forEach((b) => { scrolls[b.parentElement.id] = b.scrollTop; });
    w.innerHTML = parts.join('');
    w.querySelectorAll('.win .body').forEach((b) => { if (scrolls[b.parentElement.id]) b.scrollTop = scrolls[b.parentElement.id]; });
  }

  frame(id, title, body, cls = '') {
    return `<div class="win ${cls}" id="w_${id}"><div class="title">${esc(title)}<button class="x" data-close="${id}">×</button></div><div class="body">${body}</div></div>`;
  }

  itemCell(it, i, sel) {
    if (!it) return `<div class="cell empty" data-inv="${i}"></div>`;
    const def = this.db.items[it.id];
    return `<div class="cell${sel ? ' sel' : ''}" data-inv="${i}" title="${esc(def?.name || it.id)}" style="background:${itemColor(def)}"><span>${esc(this.short(def?.name || it.id))}</span>${it.n > 1 ? `<small>${it.n}</small>` : ''}${it.upg ? `<i>+${it.upg}</i>` : ''}</div>`;
  }

  itemInfo(it, def) {
    if (!def) return '';
    let h = `<b>${esc(def.name)}</b>${it?.upg ? ` +${it.upg}` : ''}${it?.q ? ' <span class="good">上質</span>' : ''}<br>`;
    if (def.desc) h += `<span class="dim">${esc(def.desc)}</span><br>`;
    if (def.tab === 'equip') {
      h += `${SLOT_NAMES[def.slot] || def.slot || ''}${def.weaponType ? '・' + def.weaponType : ''}　必要 Lv${def.reqLevel || 0}${def.job && def.job !== 'common' ? '・' + (LINE_NAMES[def.job] || def.job) : ''}<br>`;
      const st = it?.st || def.stats || {};
      h += Object.entries(st).filter(([, v]) => v).map(([k, v]) => `${STAT_NAMES[k] || k} +${v}`).join('　');
      if (it?.left != null) h += `<br>書の残り ${it.left} 回`;
    } else if (def.use) {
      const u = def.use;
      h += [u.hp && `HP +${u.hp}`, u.mp && `MP +${u.mp}`, u.hpPct && `HP ${u.hpPct * 100}%`, u.mpPct && `MP ${u.mpPct * 100}%`].filter(Boolean).join('　');
    }
    if (def.price) h += `<br><span class="dim">値段 ${num(def.price)} ルド</span>`;
    return h;
  }

  winInv(s) {
    const tab = s.inv[this.invTab] || [];
    let body = `<div class="tabs">${TABS.map((t, i) => `<button class="${i === this.invTab ? 'on' : ''}" data-invtab="${i}">${t}</button>`).join('')}</div>`;
    body += `<div class="grid">${tab.map((it, i) => this.itemCell(it, i, i === this.invSel)).join('')}</div>`;
    body += `<div class="meso">${num(s.meso)} ルド</div>`;
    const it = tab[this.invSel];
    if (it) {
      const def = this.db.items[it.id];
      body += `<div class="info">${this.itemInfo(it, def)}<div class="btns">`;
      if (this.invTab === 0) body += `<button data-act="equip" data-n="${this.invSel}">装備する</button>`;
      if (this.invTab === 1 && def?.scroll) {
        body += `書を使う: ` + Object.keys(s.eq).map((k) => `<button data-act="scrollEquipped" data-a="${it.id}" data-b="${k}">${SLOT_NAMES[k] || k}</button>`).join('');
      } else if (this.invTab === 1 || this.invTab === 2 || def?.pet || def?.chair) body += `<button data-act="use" data-a="${it.id}">使う</button>`;
      if (this.invTab === 1 || this.invTab === 2) body += `<button data-pick="item" data-id="${it.id}">クイックに置く</button>`;
      if (this.shop) body += `<button data-act="sell" data-a="${this.invTab}" data-n="${this.invSel}">売る</button>`;
      if (this.storageNpc) body += `<button data-act="storeIn" data-a="${this.storageNpc}" data-b="${this.invTab}" data-n="${this.invSel}">預ける</button>`;
      body += `</div></div>`;
    } else body += `<div class="info dim">品をクリックすると説明と操作が出ます。</div>`;
    return this.frame('inv', '持ち物 (I)', body);
  }

  winEquip(s) {
    const keys = ['cap', 'face', 'eye', 'earring', 'top', 'bottom', 'overall', 'shoes', 'gloves', 'cape', 'shield', 'weapon', 'ring1', 'ring2', 'pendant'];
    let body = '<table class="eq">';
    for (const k of keys) {
      const it = s.eq[k];
      if (!it && !['cap', 'top', 'bottom', 'shoes', 'gloves', 'weapon', 'shield'].includes(k)) continue;
      const def = it && this.db.items[it.id];
      body += `<tr><th>${SLOT_NAMES[k]}</th><td>${it ? `<span class="sw" style="background:${itemColor(def)}"></span>${esc(def?.name || it.id)}${it.upg ? ' +' + it.upg : ''}<br><small class="dim">${Object.entries(it.st || {}).filter(([, v]) => v).map(([kk, v]) => `${STAT_NAMES[kk] || kk}+${v}`).join(' ')}</small>` : '<span class="dim">—</span>'}</td>
        <td>${it ? `<button data-act="unequip" data-a="${k}">外す</button>` : ''}</td></tr>`;
    }
    body += '</table><div class="dim">装備するには 持ち物 (I) の装備のタブから。</div>';
    return this.frame('equip', '装備 (E)', body);
  }

  winStat(s) {
    const st = s.stats;
    const plus = (k) => s.ap > 0 ? `<button class="plus" data-act="ap" data-a="${k}">+</button>` : '';
    let body = `<div><b>${esc(s.name)}</b>　${esc(s.job)}　Lv ${s.lv}</div>
      <div class="dim">経験値 ${num(s.exp)} / ${num(s.next)}　お金 ${num(s.meso)} ルド　遊んだ時間 ${Math.floor(s.play / 60)} 分</div>
      <table class="st">
      <tr><th>HP</th><td>${s.hp} / ${s.maxhp}</td><td>${plus('hp')}</td><th>攻撃</th><td>${st.min} 〜 ${st.max}</td></tr>
      <tr><th>MP</th><td>${s.mp} / ${s.maxmp}</td><td>${plus('mp')}</td><th>攻撃力</th><td>${st.watk}　魔力 ${st.matk}</td></tr>
      <tr><th>STR</th><td>${st.str} <small class="dim">(${s.base.str})</small></td><td>${plus('str')}</td><th>防御</th><td>${st.wdef}　魔防 ${st.mdef}</td></tr>
      <tr><th>DEX</th><td>${st.dex} <small class="dim">(${s.base.dex})</small></td><td>${plus('dex')}</td><th>命中</th><td>${st.acc}　回避 ${st.avoid}</td></tr>
      <tr><th>INT</th><td>${st.int} <small class="dim">(${s.base.int})</small></td><td>${plus('int')}</td><th>速さ</th><td>${st.speed}%　ジャンプ ${st.jump}%</td></tr>
      <tr><th>LUK</th><td>${st.luk} <small class="dim">(${s.base.luk})</small></td><td>${plus('luk')}</td><th>会心</th><td>${st.crit}%　${esc(st.weapon)}</td></tr>
      </table>
      <div class="ap ${s.ap > 0 ? 'have' : ''}">AP ${s.ap}${s.ap > 0 ? '　← + で振る（Lv が上がるたびに 5）' : ''}</div>
      <div class="dim">1 次転職の条件: 戦士 STR35・魔法使い INT20(Lv8)・弓使い DEX25・盗賊 DEX25・海賊 DEX20（Lv10）</div>`;
    return this.frame('stat', '能力値 (S)', body);
  }

  winSkill(s) {
    const tiers = [...new Set(s.skills.map((k) => k.tier))].sort();
    if (!tiers.includes(this.skillTier)) this.skillTier = tiers[0] ?? 0;
    const tierName = (t) => t === 0 ? '初心者' : t + ' 次';
    let body = `<div class="tabs">${tiers.map((t) => `<button class="${t === this.skillTier ? 'on' : ''}" data-skilltier="${t}">${tierName(t)}</button>`).join('')}</div>`;
    body += `<div class="sp">SP ${s.sp[this.skillTier] ?? 0}</div><div class="list">`;
    for (const k of s.skills.filter((x) => x.tier === this.skillTier)) {
      const def = this.db.skills[k.id] || {};
      const canUp = k.can === 'Ok';
      body += `<div class="row${this.skillSel === k.id ? ' sel' : ''}" data-skillsel="${k.id}"><div class="ic" style="background:${k.lv > 0 ? '#6a5acd' : '#555'}">${esc(this.short(def.name))}</div>
        <div class="tx"><b>${esc(def.name || k.id)}</b> <span class="dim">Lv ${k.lv}/${k.max}${k.passive ? '・パッシブ' : ''}${k.mp ? '・MP ' + k.mp : ''}</span><br><small>${esc(def.desc || '')}</small></div>
        <div class="bt">${canUp ? `<button class="plus" data-act="learn" data-a="${k.id}">+</button>` : `<small class="dim">${k.can === 'NoSp' ? '' : k.can === 'MaxLevel' ? '最大' : k.can === 'TierTooLow' ? '転職後' : k.can === 'PrereqMissing' ? '前提' : ''}</small>`}
        ${k.lv > 0 && !k.passive ? `<button data-pick="skill" data-id="${k.id}">クイック</button>` : ''}</div></div>`;
    }
    body += '</div>';
    return this.frame('skill', 'スキル (K)', body);
  }

  questBlock(q, full) {
    let h = `<div class="quest"><b>${esc(q.name)}</b> <span class="dim">${esc(q.id)}${q.giver ? '・' + esc(q.giver) : ''}</span>${q.done ? ' <span class="good">達成！報告しよう</span>' : ''}<br>`;
    if (full && q.story) h += `<div class="story">${esc(q.story)}</div>`;
    if (q.goal) h += `<small>${esc(q.goal)}</small><br>`;
    for (const o of q.objs) {
      const label = o.label || this.objLabel(o);
      h += `<small class="${o.have >= o.need ? 'good' : ''}">・${esc(label)} ${o.have}/${o.need}</small><br>`;
    }
    if (full) h += `<small class="dim">報酬: 経験値 ${num(q.exp)}${q.meso ? '・' + num(q.meso) + ' ルド' : ''}${q.rewards.map((r) => '・' + this.itemName(r.item) + (r.n > 1 ? '×' + r.n : '')).join('')}</small>`;
    return h + '</div>';
  }
  objLabel(o) {
    const t = o.target || '';
    const name = this.db.monsters[t]?.name || this.db.items[t]?.name || this.db.npcs[t]?.name || this.game.mapName(t, true) || t;
    return `${name}を${OBJ_TYPES[o.type] || o.type}`;
  }

  winQuest(s) {
    let body = s.quests.length ? s.quests.map((q) => this.questBlock(q, false)).join('') : '<div class="dim">進めているクエストは無い。頭の上に電球が出ている NPC に話しかけよう。</div>';
    body += `<div class="dim">完了したクエスト: ${s.done} 本</div>`;
    return this.frame('quest', 'クエスト (Q)', body);
  }

  winOpt(s) {
    const v = this.game.audio.vol;
    const body = `<div class="opt">
      <label>BGM <input type="range" min="0" max="100" value="${Math.round(v.bgm * 100)}" data-vol="bgm"></label>
      <label>効果音 <input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" data-vol="sfx"></label>
      <label><input type="checkbox" data-mute ${v.muted ? 'checked' : ''}> 消音</label>
      <div class="btns"><button data-act="save">今すぐセーブ</button><button data-sys="reload">セーブから読み直す</button><button data-sys="export">セーブをコピー</button></div>
      <div class="btns">${this.confirmNew ? `今のセーブを消して最初から？ <button data-sys="newgameYes" class="warn">消して始める</button><button data-sys="newgameNo">やめる</button>` : `<button data-sys="newgame" class="warn">最初から（今のセーブは消える）</button>`}<button data-sys="keys">キーの表示</button></div>
      <div class="dim">セーブはこのブラウザの中（localStorage）。マップ移動・Lv アップ・クエスト完了・3 分ごとに自動で保存。<br>場所: ${esc(s.mapName)}（${esc(s.map)}）</div>
      <div class="dim" id="perf"></div></div>`;
    return this.frame('opt', '設定・セーブ (O)', body);
  }

  // ---------------- 会話
  openDialog(d) {
    if (!d) return;
    this.dialog = d; this.dialogQuest = null; this.dialogMsg = '';
    this.open.add('dialog');
    this.game.audio.sfx('ui_open');
    this.refresh(true);
  }

  winDialog(s) {
    const d = this.dialog;
    let body = '';
    if (this.dialogMsg) body += `<div class="say">${esc(this.dialogMsg)}</div>`;
    if (this.dialogQuest) {
      const q = this.dialogQuest;
      body += this.questBlock(q, true);
      const isAvail = d.available.some((x) => x.id === q.id);
      body += `<div class="btns">${isAvail ? `<button data-act="accept" data-a="${q.id}" data-b="${d.npc}">受ける</button>` : ''}<button data-dq="">もどる</button></div>`;
      return this.frame('dialog', d.name, body, 'dlg');
    }
    const lines = [];
    if (!d.available.length && !d.completable.length && !d.inProgress.length && !d.shop && !d.job) lines.push(greet(d.role));
    body += lines.map((l) => `<div class="say">${esc(l)}</div>`).join('');
    for (const q of d.completable) body += `<div class="opt-row"><span class="bulb g">●</span> ${esc(q.name)} <button data-act="complete" data-a="${q.id}" data-b="${d.npc}">報告する</button></div>`;
    for (const q of d.available) body += `<div class="opt-row"><span class="bulb y">●</span> ${esc(q.name)} <span class="dim">Lv${q.lv}〜</span> <button data-dq="${q.id}">話を聞く</button></div>`;
    for (const q of d.inProgress) body += this.questBlock(q, false);
    if (d.shop) body += `<div class="opt-row">🛒 店 <button data-shop="${d.shop}">品を見る</button></div>`;
    if (d.inn != null) body += `<div class="opt-row">宿屋 <button data-act="inn" data-a="${d.npc}">休む（${num(d.inn)} ルド）</button></div>`;
    if (d.travel) body += `<div class="opt-row">乗り物 → ${esc(this.mapName(d.travel.to))} <button data-act="travel" data-a="${d.npc}">乗る（${num(d.travel.fee)} ルド${d.travel.minLv ? '・Lv' + d.travel.minLv + '〜' : ''}）</button></div>`;
    if (d.taxi) for (const t of d.taxi) body += `<div class="opt-row">タクシー → ${esc(this.mapName(t.to))} <button data-act="taxi" data-a="${d.npc}" data-b="${t.to}">${num(t.fee)} ルド</button></div>`;
    if (d.storage) body += `<div class="opt-row">倉庫 <button data-storage="${d.npc}">開く</button></div>`;
    if (d.crafts) for (const c of d.crafts) body += `<div class="opt-row">作る: ${esc(this.itemName(c.out))}${c.n > 1 ? '×' + c.n : ''} <small class="dim">← ${c.in.map((i) => this.itemName(i.item) + '×' + i.n).join('・')}・${num(c.fee)} ルド</small> <button data-act="craft" data-a="${d.npc}" data-b="${c.id}">作る</button></div>`;
    if (d.job) {
      const j = d.job;
      if (j.first) body += `<div class="opt-row">転職官: ${esc(j.name)}になる <button data-act="advance1" data-a="${j.line}" data-b="${d.npc}" ${j.first === 'Ok' ? '' : 'disabled'}>${j.name}に転職する</button> <small class="dim">${j.first === 'Ok' ? '' : j.first === 'LevelTooLow' ? 'Lv が足りない' : j.first === 'StatTooLow' ? '能力値が足りない' : j.first}</small></div>`;
      if (j.second) body += `<div class="opt-row">2 次転職（Lv${j.second.lv}・試験の証${j.second.proof ? 'あり' : 'なし'}）: ${j.second.names.map((n, i) => `<button data-act="advance2" data-n="${i}" data-b="${d.npc}" ${j.second.proof ? '' : 'disabled'}>${esc(n)}</button>`).join('')}</div>`;
    }
    body += `<div class="btns"><button data-close="dialog">さようなら</button></div>`;
    return this.frame('dialog', d.name, body, 'dlg');
  }

  winShop(s) {
    const sh = this.shop;
    let body = `<div class="cols"><div class="col"><b>店の品</b><div class="list">`;
    for (const e of sh.items) {
      const def = this.db.items[e.item];
      const stack = def && def.maxStack > 1 && !def.ammo;
      body += `<div class="row" title="${esc(def?.desc || '')}"><div class="ic" style="background:${itemColor(def)}">${esc(this.short(def?.name))}</div><div class="tx">${esc(def?.name || e.item)}${e.bundle > 1 ? '×' + e.bundle : ''}<br><small>${num(e.price)} ルド${def?.reqLevel ? '・Lv' + def.reqLevel : ''}</small></div>
        <div class="bt">${stack ? `<input type="number" min="1" max="100" value="1" id="cnt_${esc(e.item)}">` : ''}<button data-buy="${e.item}">買う</button></div></div>`;
    }
    body += `</div></div><div class="col"><b>持ち物（売る）</b><div class="tabs">${TABS.map((t, i) => `<button class="${i === this.shopTab ? 'on' : ''}" data-shoptab="${i}">${t}</button>`).join('')}</div><div class="list">`;
    (s.inv[this.shopTab] || []).forEach((it, i) => {
      if (!it) return;
      const def = this.db.items[it.id];
      body += `<div class="row"><div class="ic" style="background:${itemColor(def)}">${esc(this.short(def?.name))}</div><div class="tx">${esc(def?.name || it.id)}${it.n > 1 ? '×' + it.n : ''}</div><div class="bt"><button data-act="sell" data-a="${this.shopTab}" data-n="${i}">売る</button>${sh.recharge && def?.ammo ? `<button data-act="recharge" data-a="${sh.id}" data-n="${i}">詰め直し</button>` : ''}</div></div>`;
    });
    body += `</div></div></div><div class="meso">${num(s.meso)} ルド</div>`;
    return this.frame('shop', '店', body, 'wide');
  }

  winStorage(s) {
    const npc = this.storageNpc;
    let body = `<div class="dim">キャラ全員で共有の倉庫（出し入れ 1 回 100 ルド）　${s.storage.items.filter(Boolean).length}/${s.storage.slots} 枠</div><div class="cols"><div class="col"><b>倉庫</b><div class="list">`;
    s.storage.items.forEach((it, i) => {
      if (!it) return;
      const def = this.db.items[it.id];
      body += `<div class="row"><div class="ic" style="background:${itemColor(def)}">${esc(this.short(def?.name))}</div><div class="tx">${esc(def?.name || it.id)}${it.n > 1 ? '×' + it.n : ''}</div><div class="bt"><button data-act="storeOut" data-a="${npc}" data-n="${i}">出す</button></div></div>`;
    });
    body += `</div><div>お金 ${num(s.storage.meso)} ルド <input type="number" id="smeso" value="1000" min="1"> <button data-smeso="in">預ける</button><button data-smeso="out">出す</button></div><button data-act="storeExpand" data-a="${npc}">枠を増やす</button></div>`;
    body += `<div class="col"><b>持ち物（預ける）</b><div class="tabs">${TABS.map((t, i) => `<button class="${i === this.shopTab ? 'on' : ''}" data-shoptab="${i}">${t}</button>`).join('')}</div><div class="list">`;
    (s.inv[this.shopTab] || []).forEach((it, i) => {
      if (!it) return;
      const def = this.db.items[it.id];
      body += `<div class="row"><div class="ic" style="background:${itemColor(def)}">${esc(this.short(def?.name))}</div><div class="tx">${esc(def?.name || it.id)}${it.n > 1 ? '×' + it.n : ''}</div><div class="bt"><button data-act="storeIn" data-a="${npc}" data-b="${this.shopTab}" data-n="${i}">預ける</button></div></div>`;
    });
    body += `</div></div></div><div class="meso">${num(s.meso)} ルド</div>`;
    return this.frame('storage', '倉庫', body, 'wide');
  }

  winPicker(s) {
    const p = this.picker;
    const name = p.kind === 'skill' ? this.skillName(p.id) : this.itemName(p.id);
    let body = `<div>「${esc(name)}」をどのキーに置く？</div><div class="pick">`;
    QUICK_KEYS.forEach((k, i) => {
      const q = s.quick[i];
      body += `<button data-put="${i}">${k}<br><small>${q ? esc(this.short(q.kind === 'skill' ? this.skillName(q.id) : this.itemName(q.id))) : '—'}</small></button>`;
    });
    body += '</div>';
    return this.frame('picker', 'クイックスロット', body, 'picker');
  }

  // ---------------- 窓の外の大きな知らせ
  showDead() {
    this.deadShown = true;
    this.el('modal').innerHTML = `<div class="win modal"><div class="title">倒れてしまった…</div><div class="body"><div>近くの町で起き上がります（1 次転職の後は経験値を少し失う）。</div><div class="btns"><button data-act="revive">町へ戻る</button></div></div></div>`;
  }

  showQuiz(qz) {
    const key = qz[0] + qz[2];
    if (this.quizShown === key) return;
    this.quizShown = key;
    this.el('modal').innerHTML = `<div class="win modal"><div class="title">賢者の石のクイズ ${qz[0]}/${qz[1]}</div><div class="body"><div class="say">${esc(qz[2])}</div>${qz[3].map((c, i) => `<button class="choice" data-act="quiz" data-n="${i}">${esc(c)}</button>`).join('')}</div></div>`;
  }

  // ---------------- クリック
  onClick(e) {
    const t = e.target.closest('button, [data-inv], [data-skillsel], .qs');
    if (!t) return;
    if (t.blur) t.blur(); // Space・Enter でボタンがもう一度押されないように
    this.game.audio.unlock();
    const ds = t.dataset;
    if (ds.win) { this.toggle(ds.win); return; }
    if (ds.close) { this.close(ds.close); return; }
    if (t.classList.contains('qs')) {
      if (this.picker) { this.put(+ds.q); return; }
      this.game.pressQuick(+ds.q);
      return;
    }
    if (ds.invtab != null) { this.invTab = +ds.invtab; this.invSel = -1; this.renderWins(); return; }
    if (ds.inv != null) { this.invSel = +ds.inv; this.game.audio.sfx('ui_click'); this.renderWins(); return; }
    if (ds.skilltier != null) { this.skillTier = +ds.skilltier; this.renderWins(); return; }
    if (ds.skillsel != null && t.tagName !== 'BUTTON') { this.skillSel = ds.skillsel; this.renderWins(); return; }
    if (ds.shoptab != null) { this.shopTab = +ds.shoptab; this.renderWins(); return; }
    if (ds.pick) { this.picker = { kind: ds.pick, id: ds.id }; this.renderWins(); return; }
    if (ds.put != null) { this.put(+ds.put); return; }
    if (ds.dq != null) { this.dialogQuest = ds.dq ? [...this.dialog.available, ...this.dialog.completable].find((q) => q.id === ds.dq) : null; this.dialogMsg = ''; this.renderWins(); return; }
    if (ds.shop) { const items = this.dialog?.shopItems || []; this.shop = { id: ds.shop, items, recharge: this.dialog?.recharge }; this.open.add('shop'); this.renderWins(); return; }
    if (ds.storage) { this.storageNpc = ds.storage; this.open.add('storage'); this.renderWins(); return; }
    if (ds.buy) {
      const inp = this.root.querySelector('#cnt_' + CSS.escape(ds.buy));
      this.doAct('buy', this.shop.id, ds.buy, inp ? Math.max(1, +inp.value || 1) : 1);
      return;
    }
    if (ds.smeso) { const v = Math.max(1, +this.root.querySelector('#smeso').value || 0); this.doAct(ds.smeso === 'in' ? 'storeMesoIn' : 'storeMesoOut', this.storageNpc, '', v); return; }
    if (ds.sys) { this.game.sys(ds.sys); return; }
    if (ds.act) { this.doAct(ds.act, ds.a ?? '', ds.b ?? '', ds.n != null ? +ds.n : 0); }
  }

  put(i) {
    const p = this.picker; this.picker = null;
    this.doAct('quick', p.kind, p.id, i);
  }

  doAct(cmd, a, b, n) {
    const r = this.game.act(cmd, a, b, n);
    if (r.msg) { this.msg(r.msg, r.ok ? '' : 'bad'); if (this.open.has('dialog')) this.dialogMsg = r.msg; }
    if (!r.ok) this.game.audio.sfx('ui_error'); else if (cmd === 'quick' || cmd === 'ap' || cmd === 'learn') this.game.audio.sfx('ui_ok');
    if (r.dialog) { this.dialog = r.dialog; this.dialogQuest = null; }
    if (cmd === 'equip' && r.ok) this.invSel = -1;
    if ((cmd === 'travel' || cmd === 'taxi') && r.ok) { this.close('dialog'); }
    if (cmd === 'revive') { this.deadShown = false; this.el('modal').innerHTML = ''; }
    if (cmd === 'quiz') { this.quizShown = null; }
    this.refresh(true);
  }

  onVolume(e) {
    const t = e.target;
    if (t.dataset.vol) { this.game.audio.vol[t.dataset.vol] = t.value / 100; this.game.audio.applyVolume(); }
    if (t.dataset.mute != null) { this.game.audio.vol.muted = t.checked; this.game.audio.applyVolume(); }
  }
}

function greet(role) {
  switch (role) {
    case 'guide': return 'ようこそ。困ったことがあったら、いつでも話しかけておくれ。';
    case 'storage': return '大事な物を預かるよ。';
    case 'taxi': return 'どちらまで？';
    case 'job': return '強くなりたければ、まず Lv を上げることだ。';
    default: return 'こんにちは。いい天気だね。';
  }
}
