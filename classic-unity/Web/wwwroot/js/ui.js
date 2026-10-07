// HUD と窓（DOM。800×600 の座標で置き、canvas と同じ倍率で拡大する）。
// 中身は C# の GetUi()（能力値・持ち物・装備・スキル・クエスト・クイックスロット）と会話（Dialog）を読むだけ。
// 操作は game.act(cmd, a, b, n) → C# の Actions.Run。
import { itemColor, mobColor } from './render.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('ja-JP');
const TABS = ['装備', '消費', '設置', 'その他', '特別'];
const SLOT_NAMES = { medal: '勲章', cap: '帽子', face: '顔飾り', eye: '目飾り', earring: '耳飾り', top: '上着', bottom: '下衣', overall: '全身', shoes: '靴', gloves: '手袋', cape: 'マント', shield: '盾', weapon: '武器', ring1: '指輪1', ring2: '指輪2', pendant: '首飾り' };
const STAT_NAMES = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', hp: 'HP', mp: 'MP', watk: '攻撃力', matk: '魔力', wdef: '防御', mdef: '魔防', acc: '命中', avoid: '回避', speed: '速さ', jump: 'ジャンプ' };
const LINE_NAMES = { warrior: '戦士', magician: '魔法使い', bowman: '弓使い', thief: '盗賊', pirate: '海賊' };
const OBJ_TYPES = { Kill: '倒す', Collect: '集める', Talk: '話す', Visit: '行く', Interact: '調べる', Event: 'する' };

// V は「話す・会話を進める」に使うので、クイックスロットは T
export const QUICK_KEYS = ['Shift', 'A', 'D', 'F', 'G', 'T', 'B', 'Y', '1', '2', '3', '4', '5', '6', '7', '8'];

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
    // やりこみの窓（図鑑 L・勲章 N・記録 U・全体マップ W）
    this.bookRegion = null; this.bookSel = null; this.medalTab = 'all'; this.recTab = 'rec'; this.worldRegion = null; this.worldSel = null;
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
          <button data-win="skill" title="スキル (K)">技</button><button data-win="quest" title="クエスト (Q)">ク</button><button data-win="book" title="敵の図鑑 (L)">図</button>
          <button data-win="medal" title="勲章 (N)">勲</button><button data-win="record" title="記録と統計 (U)">記</button><button data-win="world" title="全体マップ (W)">地</button><button data-win="opt" title="設定・セーブ (O)">設</button>
        </div>
      </div>
      <div id="jq"></div>
      <div id="wins"></div>
      <div id="modal"></div>`;
    this.el('keys').innerHTML = `<b>キー</b> <small>(H で隠す)</small><br>
      ←→ 歩く / ↑ はしご・縄・ポータル / ↓ 伏せ・下りる<br>
      Alt・Space・C ジャンプ（↓+ジャンプで下へ）<br>
      Ctrl・X 攻撃 / Z 拾う / V・Enter 話す・調べる<br>
      会話中: V・Enter 決める / ↑↓ 選ぶ / Esc 閉じる<br>
      クイック: Shift A D F G T B Y ・ 1〜8<br>
      I 持ち物 E 装備 S 能力値 K スキル Q クエスト<br>
      L 図鑑 N 勲章 U 記録 W 全体マップ<br>
      O 設定・セーブ / M ミニマップ / Esc 閉じる<br>
      R＋1〜7 感情表現（R だけで選ぶ帯）<br>
      NPC はクリックでも話せる`;
    const q = this.el('quick');
    q.innerHTML = QUICK_KEYS.map((k, i) => `<div class="qs" data-q="${i}"><em>${k}</em><span></span><small></small></div>`).join('');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('contextmenu', (e) => {
      const qs = e.target.closest('.qs');
      if (qs) { e.preventDefault(); this.game.act('quick', '', '', +qs.dataset.q); this.refresh(); }
    });
    this.root.addEventListener('keydown', (e) => e.stopPropagation()); // 窓の中の入力欄
    // 全体マップ: 点にマウスを乗せると下の説明が変わる（窓は描き直さない）
    this.root.addEventListener('mouseover', (e) => {
      const g = e.target.closest?.('[data-wm]');
      if (g && this.open.has('world') && this.worldSel !== g.dataset.wm) { this.worldSel = g.dataset.wm; const info = this.root.querySelector('#wmInfo'); if (info) info.outerHTML = this.worldInfo(); }
    });
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
    // ジャンプの試練: 今の段と時間（上の真ん中）
    const jq = this.el('jq');
    const jt = f.jq ? `ジャンプの試練　${Math.min(f.jq[0], f.jq[1])} / ${f.jq[1]} 段${f.jq[0] > f.jq[1] ? '（てっぺん！宝箱を V で）' : ''}　${f.jq[2] >= 0 ? fmtTime(f.jq[2]) : ''}` : '';
    if (jq.textContent !== jt) { jq.textContent = jt; jq.style.display = jt ? '' : 'none'; }
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
    if (name === 'dialog') { this.dialog = null; this.dialogQuest = null; this.dlgSel = null; }
    if (name === 'shop') this.shop = null;
    if (name === 'storage') this.storageNpc = null;
    this.game.audio.sfx('ui_close');
    this.renderWins();
    return true;
  }
  closeTop() {
    if (this.picker) { this.picker = null; this.renderWins(); return true; }
    const order = ['dialog', 'shop', 'storage', 'world', 'record', 'medal', 'book', 'opt', 'quest', 'skill', 'stat', 'equip', 'inv'];
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
    if (this.open.has('book')) parts.push(this.winBook(s));
    if (this.open.has('medal')) parts.push(this.winMedal(s));
    if (this.open.has('record')) parts.push(this.winRecord(s));
    if (this.open.has('world')) parts.push(this.winWorld(s));
    if (this.open.has('dialog') && this.dialog) parts.push(this.winDialog(s));
    if (this.open.has('shop') && this.shop) parts.push(this.winShop(s));
    if (this.open.has('storage') && this.storageNpc) parts.push(this.winStorage(s));
    if (this.picker) parts.push(this.winPicker(s));
    const w = this.el('wins');
    const scrolls = {};
    w.querySelectorAll('.win .body').forEach((b) => { scrolls[b.parentElement.id] = b.scrollTop; });
    w.innerHTML = parts.join('');
    w.querySelectorAll('.win .body').forEach((b) => { if (scrolls[b.parentElement.id]) b.scrollTop = scrolls[b.parentElement.id]; });
    if (this.open.has('dialog')) this.markDialogSel();
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
      body += `<div class="info">${this.itemInfo(it, def)}${this.invTab === 0 ? this.compareEquip(def, s, it) : ''}<div class="btns">`;
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
    const keys = ['cap', 'face', 'eye', 'earring', 'top', 'bottom', 'overall', 'shoes', 'gloves', 'cape', 'shield', 'weapon', 'ring1', 'ring2', 'pendant', 'medal'];
    let body = '<table class="eq">';
    for (const k of keys) {
      const it = s.eq[k];
      if (!it && !['cap', 'top', 'bottom', 'shoes', 'gloves', 'weapon', 'shield', 'medal'].includes(k)) continue;
      const def = it && this.db.items[it.id];
      body += `<tr><th>${SLOT_NAMES[k]}</th><td>${it ? `<span class="sw" style="background:${itemColor(def)}"></span>${esc(def?.name || it.id)}${it.upg ? ' +' + it.upg : ''}<br><small class="dim">${Object.entries(it.st || {}).filter(([, v]) => v).map(([kk, v]) => `${STAT_NAMES[kk] || kk}+${v}`).join(' ')}</small>` : '<span class="dim">—</span>'}</td>
        <td>${it ? `<button data-act="unequip" data-a="${k}">外す</button>` : ''}</td></tr>`;
    }
    body += '</table><div class="dim">装備するには 持ち物 (I) の装備のタブから。勲章は 勲章 (N) の窓から付けられる。</div>';
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
      <div class="dim">セーブはこのブラウザの中（localStorage）。マップ移動・Lv アップ・クエスト完了・1 分ごとに自動で保存。<br>場所: ${esc(s.mapName)}（${esc(s.map)}）</div>
      <div class="dim" id="perf"></div></div>`;
    return this.frame('opt', '設定・セーブ (O)', body);
  }

  // ---------------- やりこみの窓のデータ（C# の CollectionUi.cs。開いている時・操作の後だけ）
  data(cmd) { const r = this.game.act(cmd); return r.ok ? r.data : null; }

  // ---------------- 敵の図鑑（L）: 地域ごと・未発見はシルエット・どこに出るか
  winBook(s) {
    const b = this.data('book'); if (!b) return '';
    if (!this.bookRegion || !b.regions.some((r) => r.id === this.bookRegion)) {
      const here = this.game.db.worldmap.maps[s.map]?.region;
      this.bookRegion = b.regions.some((r) => r.id === here) ? here : b.regions[0]?.id;
    }
    const pct = (a, n) => (n ? Math.floor(a / n * 100) : 0);
    let body = `<div class="bookhead"><b>図鑑の段 ${b.lv}</b>　完成 ${b.done} / ${b.total} 種（${pct(b.done, b.total)}%）・カード ${num(b.cards)} 枚<br>
      <span class="dim">今の上乗せ: ${esc(b.bonus)}${b.next > 0 ? `　次の段まで あと ${b.next - b.done} 種（${esc(b.nextBonus)}）` : '　（最高の段）'}</span><br>
      <span class="dim">敵を倒すと、まれに「その敵のカード」を落とす（強敵・ボスは多め）。1 種類 ${b.per} 枚で完成。</span></div>`;
    body += `<div class="tabs">${b.regions.map((r) => `<button class="${r.id === this.bookRegion ? 'on' : ''}" data-bookr="${r.id}">${esc(r.name.replace(/（.*$/, ''))} ${r.done}/${r.total}${r.got ? '★' : ''}</button>`).join('')}</div>`;
    const reg = b.regions.find((r) => r.id === this.bookRegion);
    if (reg) body += `<div class="dim">この地域を全部完成させると 勲章「${esc(reg.medal || '')}」と ${num(reg.meso)} ルド${reg.got ? '（もらった）' : ''}</div>`;
    body += '<div class="book">';
    for (const m of b.mobs.filter((x) => x.r === this.bookRegion)) {
      const def = this.db.monsters[m.id] || {};
      const pips = Array.from({ length: b.per }, (_, i) => `<i class="${i < m.n ? 'on' : ''}"></i>`).join('');
      body += `<div class="bcard${m.n >= b.per ? ' done' : ''}${m.seen ? '' : ' unseen'}${this.bookSel === m.id ? ' sel' : ''}" data-bookm="${m.id}" title="${m.seen ? esc(def.name) : '？？？'}">`
        + `<div class="pic" style="background:${m.seen ? mobColor(def) : '#111'}">${m.seen ? '' : '？'}</div><div class="nm">${m.seen ? esc(def.name) : '？？？'}</div><div class="pips">${pips}</div></div>`;
    }
    body += '</div>';
    const sel = b.mobs.find((x) => x.id === this.bookSel);
    if (sel) {
      const def = this.db.monsters[sel.id] || {};
      const where = sel.maps.map((id) => esc(this.game.mapName(id))).join('・') + (sel.more ? ` ほか ${sel.more}` : '');
      body += `<div class="info">${sel.seen ? `<b>${esc(def.name)}</b>　Lv ${def.lv ?? '?'}　HP ${num(def.hp)}　経験値 ${num(def.exp)}<br>倒した数 ${num(sel.kills)}　カード ${sel.n}/${b.per}${sel.n >= b.per ? ' <span class="good">完成</span>' : ''}` : '<b>？？？</b>　まだ会っていない敵'}<br><span class="dim">出る所: ${where}</span></div>`;
    } else body += '<div class="info dim">カードをクリックすると、どこに出るかが出ます。</div>';
    return this.frame('book', '敵の図鑑 (L)', body);
  }

  // ---------------- 勲章（N）: 取った物・まだの物と条件のヒント。1 つだけ付けられる（メダルの欄）
  winMedal(s) {
    const d = this.data('medals'); if (!d) return '';
    const got = d.list.filter((m) => m.got).length;
    let body = `<div>手に入れた勲章 <b>${got}</b> / ${d.list.length}　付けている: <b class="gold">${esc(d.worn ? this.itemName(d.worn) : 'なし')}</b> ${d.worn ? '<button data-act="medal" data-a="">外す</button>' : ''}</div>
      <div class="dim">付けると名前の上に札が出て、小さな能力がつく（付けられるのは 1 つ・重ならない）。条件の勲章は自動で、クエストの勲章は依頼でもらえる。</div>`;
    body += `<div class="tabs">${[['all', '全部'], ['got', '持っている'], ['not', 'まだ']].map(([k, t]) => `<button class="${k === this.medalTab ? 'on' : ''}" data-medaltab="${k}">${t}</button>`).join('')}</div><div class="list">`;
    let group = null;
    for (const m of d.list) {
      if (this.medalTab === 'got' && !m.got) continue;
      if (this.medalTab === 'not' && m.got) continue;
      if (m.group !== group) { group = m.group; body += `<div class="grp">${esc(group)}</div>`; }
      const st = Object.entries(m.stats || {}).filter(([, v]) => v).map(([k, v]) => `${STAT_NAMES[k] || k}+${v}`).join(' ');
      const prog = m.prog ? ` <span class="dim">(${num(m.prog[0])}/${num(m.prog[1])})</span>` : '';
      const worn = d.worn === m.id;
      body += `<div class="row medal${m.got ? '' : ' not'}"><div class="ic" style="background:${m.got ? '#c89020' : '#333'}">${m.got ? '勲' : '？'}</div>`
        + `<div class="tx"><b>${esc(m.name)}</b>${worn ? ' <span class="good">付けている</span>' : ''}<br><small>${esc(m.hint || '')}${prog}</small><br><small class="dim">${esc(st || '能力なし')}</small></div>`
        + `<div class="bt">${m.got && !worn ? `<button data-act="medal" data-a="${m.id}">付ける</button>` : ''}</div></div>`;
    }
    body += '</div>';
    return this.frame('medal', '勲章 (N)', body);
  }

  // ---------------- 記録と統計（U）・ジャンプの試練・椅子の一覧
  winRecord(s) {
    const r = this.data('records'); if (!r) return '';
    let body = `<div class="tabs">${[['rec', '記録'], ['jump', 'ジャンプの試練'], ['chair', '椅子']].map(([k, t]) => `<button class="${k === this.recTab ? 'on' : ''}" data-rectab="${k}">${t}</button>`).join('')}</div>`;
    if (this.recTab === 'rec') {
      const row = (a, b, c, d) => `<tr><th>${a}</th><td>${b}</td><th>${c}</th><td>${d}</td></tr>`;
      body += `<table class="st">
        ${row('遊んだ時間', fmtTime(r.play), '倒れた回数', num(r.deaths))}
        ${row('倒した敵', num(r.kills) + ' 体', '敵の種類', num(r.kinds))}
        ${row('ボスを倒した', num(r.bossKills) + ' 回', 'ボスの種類', `${r.bossKinds} / ${r.bossTotal}`)}
        ${row('最大ダメージ', num(r.maxDamage), 'クエスト', num(r.quests) + ' 本')}
        ${row('拾ったお金', num(r.mesoPicked) + ' ルド', '一番多いお金', num(r.maxMeso))}
        ${row('拾った品', num(r.itemsPicked), '飲んだ薬', num(r.potions))}
        ${row('書 成功', num(r.scrollOk), '失敗・壊れた', `${num(r.scrollFail)}・${num(r.scrollBroken)}`)}
        ${row('最高の強化', '+' + r.bestUpgrade, 'ダンジョン', num(r.dungeons) + ' 回')}
        ${row('訪ねたマップ', `${r.maps} / ${r.mapsTotal}`, '訪ねた町', num(r.towns))}
        ${row('隠し部屋', `${r.hidden} / ${r.hiddenTotal}`, '勲章', num(r.medals))}
        ${row('図鑑のカード', num(r.cards) + ' 枚', '図鑑 完成', num(r.bookDone) + ' 種')}
        </table>`;
      body += '<div class="grp">ボスの最短撃破</div>' + (r.boss.length ? r.boss.map((b) => `<div>${esc(this.db.monsters[b.mob]?.name || b.mob)}　<b>${fmtTime(b.sec)}</b></div>`).join('') : '<div class="dim">まだ無い（最初に攻撃してから倒すまでの時間）</div>');
    } else if (this.recTab === 'jump') {
      body += '<div class="dim">足場を跳び継いで上まで登る、敵のいない試練。町の案内人から入る。落ちると今の段の床へ。てっぺんの宝箱で、初めてのごほうびと勲章（2 回目からは 1 日 1 回）。</div>';
      for (const j of r.jumps) body += `<div class="row"><div class="tx"><b>${esc(j.name)}</b>（${j.stages} 段・入口 ${esc(this.game.mapName(j.town))}）<br><small>${j.clears ? `登った ${j.clears} 回・最短 ${fmtTime(j.best)}` : '<span class="dim">まだ登っていない</span>'}</small></div></div>`;
    } else {
      const have = r.chairs.filter((c) => c.got).length;
      body += `<div>集めた椅子 ${have} / ${r.chairs.length}（座ると回復が速くなる）</div>`;
      for (const c of r.chairs) body += `<div class="row"><div class="ic" style="background:${c.got ? '#8a5a2a' : '#333'}">${c.got ? '椅' : '？'}</div><div class="tx">${c.got ? esc(c.name) : '？？？'}${c.have ? ' <span class="good">持っている</span>' : ''}</div></div>`;
    }
    return this.frame('record', '記録と統計 (U)', body);
  }

  // ---------------- 全体マップ（W）: 地域ごとの絵地図・今いる所（点滅）・クエストの印
  winWorld(s) {
    const wm = this.game.db.worldmap;
    const w = this.data('world'); if (!w) return '';
    this.worldMarks = w;
    const bk = this.data('book');
    this.seenMobs = new Set((bk?.mobs || []).filter((m) => m.seen).map((m) => m.id));
    if (!this.worldRegion || !wm.regions.some((r) => r.id === this.worldRegion)) this.worldRegion = w.region || wm.regions[0]?.id;
    const reg = wm.regions.find((r) => r.id === this.worldRegion);
    let body = `<div class="tabs">${wm.regions.map((r) => `<button class="${r.id === this.worldRegion ? 'on' : ''}" data-wmr="${r.id}">${esc(r.name.replace(/（.*$/, ''))}${r.id === w.region ? ' ●' : ''}</button>`).join('')}</div>`;
    if (!reg) return this.frame('world', '全体マップ (W)', body);
    const W = 760, H = 380, kx = W / 1000, ky = H / 600;
    const ids = new Set(reg.maps);
    const P = (id) => { const n = wm.maps[id]; return [Math.round(n.x * kx), Math.round(n.y * ky)]; };
    let svg = `<svg class="wmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (const [a, b] of wm.links) if (ids.has(a) && ids.has(b)) { const [x1, y1] = P(a), [x2, y2] = P(b); svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ln"/>`; }
    for (const [a, b] of wm.travel) if (ids.has(a) && ids.has(b)) { const [x1, y1] = P(a), [x2, y2] = P(b); svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ln tr"/>`; }
    // 地域の外へのつながり（ポータル・乗り物）: 点の横に「→地域」
    const outer = {};
    for (const [a, b] of [...wm.outer, ...wm.travel]) {
      if (ids.has(a) && !ids.has(b)) (outer[a] ||= new Set()).add(wm.maps[b]?.region);
      if (ids.has(b) && !ids.has(a)) (outer[b] ||= new Set()).add(wm.maps[a]?.region);
    }
    for (const id of reg.maps) {
      const n = wm.maps[id]; const [x, y] = P(id);
      const mk = w.marks[id] || 0;
      const seen = mk & 16;
      const cls = { 町: 'town', 狩: 'field', 洞: 'cave', ボ: 'boss', 特: 'special', 移: 'move', 試: 'jump' }[n.type] || 'field';
      svg += `<g class="nd ${cls}${seen ? '' : ' unseen'}${mk & 8 ? ' here' : ''}${this.worldSel === id ? ' sel' : ''}" data-wm="${id}">`;
      if (n.type === '町') svg += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="2"/>`;
      else if (n.type === 'ボ') svg += `<polygon points="${x},${y - 7} ${x + 7},${y + 5} ${x - 7},${y + 5}"/>`;
      else if (n.type === '試') svg += `<polygon points="${x},${y - 7} ${x + 6},${y} ${x},${y + 7} ${x - 6},${y}"/>`;
      else svg += `<circle cx="${x}" cy="${y}" r="${n.type === '洞' || n.type === '特' ? 5 : 4.5}"/>`;
      if (mk & 8) svg += `<circle cx="${x}" cy="${y}" r="12" class="ring"/>`;
      if (n.type === '町' || mk & 8) svg += `<text x="${x}" y="${y + 19}" class="lb">${esc(seen || n.type === '町' ? n.name : '？？？')}</text>`;
      if (mk & 2) svg += `<g class="bulb2"><circle cx="${x + 8}" cy="${y - 12}" r="4"/><rect x="${x + 6}" y="${y - 9}" width="4" height="3"/></g>`;
      else if (mk & 1) svg += `<text x="${x + 8}" y="${y - 7}" class="qm">？</text>`;
      if (mk & 4) svg += `<text x="${x - 12}" y="${y - 7}" class="obj">★</text>`;
      if (outer[id]) svg += `<text x="${x + 9}" y="${y + 4}" class="out">→${[...outer[id]].filter(Boolean).map((r) => esc((wm.regions.find((q) => q.id === r)?.name || r).replace(/（.*$/, '').slice(0, 5))).join('・')}</text>`;
      svg += `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" class="hit"/></g>`;
    }
    svg += '</svg>';
    body += `<div class="wmwrap">${svg}</div>`;
    body += this.worldInfo();
    body += '<div class="dim">■ 町　● 狩り場　▲ ボス　◆ ジャンプの試練　？ 受けられる　電球 報告できる　★ 進めているクエストの目的地　点線 乗り物。行ったことのない所は「？？？」。</div>';
    return this.frame('world', `全体マップ (W)　${reg.name}`, body);
  }

  /** 全体マップの下の説明（マウスを乗せた点・無ければ今いる所） */
  worldInfo() {
    const wm = this.game.db.worldmap, w = this.worldMarks;
    if (!w) return '<div class="info" id="wmInfo"></div>';
    const id = this.worldSel || w.here;
    const n = wm.maps[id];
    if (!n) return '<div class="info" id="wmInfo"></div>';
    const mk = w.marks[id] || 0;
    const seen = mk & 16;
    const mobs = (n.mobs || []).map((m) => (this.seenMobs?.has(m) ? esc(this.db.monsters[m]?.name || m) : '？')).join('・');
    const bgm = this.game.audio.m?.bgm?.[n.bgm]?.title || n.bgm || '';
    const lv = n.lv ? `Lv ${n.lv[0]}〜${n.lv[1]}` : n.type === '町' ? '町' : n.type === '試' ? 'ジャンプの試練' : '';
    return `<div class="info" id="wmInfo"><b>${esc(seen || n.type === '町' ? n.name : '？？？')}</b>${mk & 8 ? ' <span class="good">← 今いる所</span>' : ''}　${lv}${seen ? `　曲「${esc(bgm)}」` : ''}<br>`
      + `${mobs ? `出る敵: ${mobs}<br>` : ''}${mk & 2 ? '<span class="good">報告できるクエストがある</span>　' : ''}${mk & 1 ? '<span class="gold">受けられるクエストがある</span>　' : ''}${mk & 4 ? '<span class="obj">進めているクエストの目的地</span>' : ''}</div>`;
  }


  // ---------------- 会話
  openDialog(d) {
    if (!d) return;
    this.dialog = d; this.dialogQuest = null; this.dialogMsg = ''; this.dlgSel = null;
    this.open.add('dialog');
    this.game.audio.sfx('ui_open');
    this.refresh(true);
  }

  winDialog(s) {
    const d = this.dialog;
    const keyHint = `<div class="dim keyhint">V・Enter 決める ／ ↑↓ 選ぶ ／ Esc 閉じる</div>`;
    let body = '';
    if (this.dialogMsg) body += `<div class="say">${esc(this.dialogMsg)}</div>`;
    if (this.dialogQuest) {
      const q = this.dialogQuest;
      body += this.questBlock(q, true);
      const isAvail = d.available.some((x) => x.id === q.id);
      body += `<div class="btns">${isAvail ? `<button data-act="accept" data-a="${q.id}" data-b="${d.npc}">受ける</button>` : ''}<button data-dq="">もどる</button></div>`;
      return this.frame('dialog', d.name, body + keyHint, 'dlg');
    }
    // 一言（話しかけるたびに変わる）と、進めているクエストの残り（C# の NpcLines.cs）
    if (!this.dialogMsg) body += `<div class="say">${esc(d.say || greet(d.role))}</div>`;
    if (d.hint) body += `<div class="say hint">${esc(d.hint)}</div>`;
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
    return this.frame('dialog', d.name, body + keyHint, 'dlg');
  }

  // ---------------- 会話の窓をキーで進める（V・Enter で選ばれているボタンを押す、↑↓ で選ぶ）
  dialogButtons() { return [...this.root.querySelectorAll('#w_dialog .body button:not([disabled])')]; }

  /** 決まりの順: 報告する → 受ける → 話を聞く → さようなら（無ければ最後のボタン） */
  dialogDefault(btns) {
    for (const p of ['[data-act="complete"]', '[data-act="accept"]', '[data-dq]:not([data-dq=""])', '[data-close="dialog"]']) {
      const i = btns.findIndex((b) => b.matches(p));
      if (i >= 0) return i;
    }
    return btns.length - 1;
  }

  markDialogSel() {
    const btns = this.dialogButtons();
    if (!btns.length) return null;
    if (this.dlgSel == null || this.dlgSel >= btns.length) this.dlgSel = this.dialogDefault(btns);
    btns.forEach((b, i) => b.classList.toggle('sel', i === this.dlgSel));
    return btns[this.dlgSel];
  }

  dialogMove(dir) {
    const btns = this.dialogButtons();
    if (!btns.length) return;
    if (this.dlgSel == null || this.dlgSel >= btns.length) this.dlgSel = this.dialogDefault(btns);
    else this.dlgSel = (this.dlgSel + dir + btns.length) % btns.length;
    const b = this.markDialogSel();
    b?.scrollIntoView?.({ block: 'nearest' });
    this.game.audio.sfx('ui_click');
  }

  dialogPress() {
    if (!this.open.has('dialog') || !this.dialog) return false;
    const b = this.markDialogSel();
    if (!b) { this.close('dialog'); return true; }
    b.click();
    return true;
  }

  winShop(s) {
    const sh = this.shop;
    let body = `<div class="cols"><div class="col"><b>店の品</b><div class="list">`;
    for (const e of sh.items) {
      const def = this.db.items[e.item];
      const stack = def && def.maxStack > 1 && !def.ammo;
      body += `<div class="row${this.shopSel === e.item ? ' sel' : ''}" data-shopsel="${e.item}" title="${esc(def?.desc || '')}"><div class="ic" style="background:${itemColor(def)}">${esc(this.short(def?.name))}</div><div class="tx">${esc(def?.name || e.item)}${e.bundle > 1 ? '×' + e.bundle : ''}<br><small>${num(e.price)} ルド${def?.reqLevel ? '・Lv' + def.reqLevel : ''}</small></div>
        <div class="bt">${stack ? `<input type="number" min="1" max="100" value="1" id="cnt_${esc(e.item)}">` : ''}<button data-buy="${e.item}">買う</button></div></div>`;
    }
    body += `</div></div><div class="col"><b>持ち物（売る）</b><div class="tabs">${TABS.map((t, i) => `<button class="${i === this.shopTab ? 'on' : ''}" data-shoptab="${i}">${t}</button>`).join('')}</div><div class="list">`;
    (s.inv[this.shopTab] || []).forEach((it, i) => {
      if (!it) return;
      const def = this.db.items[it.id];
      body += `<div class="row"><div class="ic" style="background:${itemColor(def)}">${esc(this.short(def?.name))}</div><div class="tx">${esc(def?.name || it.id)}${it.n > 1 ? '×' + it.n : ''}</div><div class="bt"><button data-act="sell" data-a="${this.shopTab}" data-n="${i}">売る</button>${sh.recharge && def?.ammo ? `<button data-act="recharge" data-a="${sh.id}" data-n="${i}">詰め直し</button>` : ''}</div></div>`;
    });
    body += `</div></div></div>`;
    // 選んだ品の説明・能力と、今の装備との差（品をクリック）
    const pick = sh.items.find((e) => e.item === this.shopSel);
    const pdef = pick && this.db.items[pick.item];
    body += pdef ? `<div class="info">${this.itemInfo(null, pdef)}${this.compareEquip(pdef, s)}</div>` : '<div class="info dim">品をクリックすると、説明・能力・今の装備との差が出ます。</div>';
    body += `<div class="meso">${num(s.meso)} ルド</div>`;
    return this.frame('shop', '店', body, 'wide');
  }

  /** 装備の品を、今その欄に着けている物と比べる（能力の差・着けられるか）。装備でなければ空 */
  compareEquip(def, s, it = null) {
    if (!def || def.tab !== 'equip' || !def.slot) return '';
    const eq = s.eq || {};
    const slot = def.slot === 'ring' ? 'ring1' : def.slot;
    // 全身は上着＋下衣と、上着・下衣は全身と比べる
    let curItems = [];
    if (slot === 'overall') curItems = [eq.overall, eq.top, eq.bottom].filter(Boolean);
    else if ((slot === 'top' || slot === 'bottom') && eq.overall) curItems = [eq.overall];
    else if (eq[slot]) curItems = [eq[slot]];
    const sum = (list) => { const o = {}; for (const x of list) for (const [k, v] of Object.entries(x.st || this.db.items[x.id]?.stats || {})) o[k] = (o[k] || 0) + (v || 0); return o; };
    const mine = it?.st || def.stats || {};
    const cur = sum(curItems);
    const keys = [...new Set([...Object.keys(mine), ...Object.keys(cur)])].filter((k) => (mine[k] || 0) !== 0 || (cur[k] || 0) !== 0);
    let h = '<div class="cmp"><b>今の装備と比べると</b>　';
    h += curItems.length ? `<span class="dim">（${curItems.map((x) => esc(this.itemName(x.id))).join('＋')}）</span><br>` : '<span class="dim">（この欄は何も着けていない）</span><br>';
    const parts = keys.map((k) => {
      const d = (mine[k] || 0) - (cur[k] || 0);
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'dim';
      return `<span class="${cls}">${STAT_NAMES[k] || k} ${d > 0 ? '+' : ''}${d}</span>`;
    });
    h += parts.length ? parts.join('　') : '<span class="dim">能力の差なし</span>';
    // 着けられるか（Lv・職・必要な能力値）
    const why = [];
    if ((def.reqLevel || 0) > (s.lv || 0)) why.push(`Lv${def.reqLevel} から`);
    if (def.job && def.job !== 'common' && def.job !== s.line) why.push(`${LINE_NAMES[def.job] || def.job}だけ`);
    const rs = (def.reqStat || '').toLowerCase();
    if (rs && def.reqValue && (s.stats?.[rs] ?? 0) < def.reqValue) why.push(`${STAT_NAMES[rs] || def.reqStat} ${def.reqValue} 以上が要る`);
    h += why.length ? `<br><span class="down">今は着けられない: ${why.join('・')}</span>` : '<br><span class="up">今すぐ着けられる</span>';
    const wt = def.weaponType, cw = curItems[0] && this.db.items[curItems[0].id]?.weaponType;
    if (slot === 'weapon' && wt && cw && wt !== cw) h += `<br><span class="dim">武器の種類が変わる（${esc(cw)} → ${esc(wt)}）</span>`;
    return h + '</div>';
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
    if (e.target.tagName === 'INPUT') return; // 個数の入力欄（窓を描き直すと入力が消える）
    const t = e.target.closest('button, [data-inv], [data-skillsel], [data-bookm], [data-wm], [data-shopsel], .qs');
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
    if (ds.shopsel != null && t.tagName !== 'BUTTON') { this.shopSel = ds.shopsel; this.game.audio.sfx('ui_click'); this.renderWins(); return; }
    if (ds.shoptab != null) { this.shopTab = +ds.shoptab; this.renderWins(); return; }
    if (ds.pick) { this.picker = { kind: ds.pick, id: ds.id }; this.renderWins(); return; }
    if (ds.put != null) { this.put(+ds.put); return; }
    if (ds.dq != null) { this.dialogQuest = ds.dq ? [...this.dialog.available, ...this.dialog.completable].find((q) => q.id === ds.dq) : null; this.dialogMsg = ''; this.dlgSel = null; this.renderWins(); return; }
    if (ds.shop) { const items = this.dialog?.shopItems || []; this.shop = { id: ds.shop, items, recharge: this.dialog?.recharge }; this.open.add('shop'); this.renderWins(); return; }
    if (ds.storage) { this.storageNpc = ds.storage; this.open.add('storage'); this.renderWins(); return; }
    if (ds.buy) {
      const inp = this.root.querySelector('#cnt_' + CSS.escape(ds.buy));
      this.doAct('buy', this.shop.id, ds.buy, inp ? Math.max(1, +inp.value || 1) : 1);
      return;
    }
    if (ds.smeso) { const v = Math.max(1, +this.root.querySelector('#smeso').value || 0); this.doAct(ds.smeso === 'in' ? 'storeMesoIn' : 'storeMesoOut', this.storageNpc, '', v); return; }
    if (ds.sys) { this.game.sys(ds.sys); return; }
    if (ds.bookr != null) { this.bookRegion = ds.bookr; this.bookSel = null; this.renderWins(); return; }
    if (ds.bookm != null) { this.bookSel = ds.bookm; this.game.audio.sfx('ui_click'); this.renderWins(); return; }
    if (ds.medaltab != null) { this.medalTab = ds.medaltab; this.renderWins(); return; }
    if (ds.rectab != null) { this.recTab = ds.rectab; this.renderWins(); return; }
    if (ds.wmr != null) { this.worldRegion = ds.wmr; this.worldSel = null; this.renderWins(); return; }
    if (ds.wm != null) { this.worldSel = ds.wm; this.renderWins(); return; }
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
    if (r.dialog) { this.dialog = r.dialog; this.dialogQuest = null; this.dlgSel = null; }
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

function fmtTime(sec) {
  const t = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s2 = t % 60;
  return h ? `${h} 時間 ${m} 分` : m ? `${m} 分 ${s2} 秒` : `${s2} 秒`;
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
