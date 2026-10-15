// はじめての案内（3〜6 歩・飛ばせる）と、設定の「遊び方」。
// 案内は画面を止めない（暗くするだけで、裏の操作はそのまま効く）。記録は state.meta.tutorial.guide（'done' | 'skip'）。
// 自動テスト（navigator.webdriver）では勝手に始めない（テストの操作を邪魔しないため）。ui.guide.start() で始められる。

import { h, clear, button } from './dom.js';
import { RARITIES } from '../data/rarity.js';
import { SHORTCUTS } from './keys.js';
import { tutorialOf } from './unlocks.js';
import { RARITY_MARK } from './panels/common.js';
import { WAVES_PER_STAGE } from '../data/world.js';
import { WAVE_CHECKPOINT } from '../game/systems/world.js';

const isPhone = () => (globalThis.innerWidth || 1200) <= 900;

export const GUIDE_STEPS = [
  { id: 'auto', target: '#hud .hud-auto', title: '自動で戦います',
    text: '主人公は自動で歩き、自動で戦います。「自動前進」が ON なら、ステージを片づけるたびに次へ進みます（Space キーでも切り替え）。' },
  { id: 'boss', target: '#hud .hud-loc', title: 'ステージとボス',
    text: '1 つの地域は 10 ステージで、10 番目がボスです。ボスに負けると手前のステージで稼ぎ直し、ときどき自動で挑み直します。すぐ挑みたいときは「ボスに挑む」を押します。' },
  { id: 'skills', target: '#hud .hud-skills', title: 'スキルは左から自動で',
    text: 'スキルの並びの左から順に、使えるものを自動で使います。レベルが上がるとスキルポイントがもらえるので、スキルの窓で強化します。' },
  { id: 'compare', target: '.panel-bag .grid', panel: 'bag', title: '装備を比べる',
    text: '拾った装備は持ち物に入ります。▲ の付いた物は今より強くなりそうな物。押すと「火力 ▲12%」のように比べて、そのまま装備できます。' },
  { id: 'filter', target: '.panel-bag .tabs .tab:nth-child(3)', panel: 'bag', title: '自動の振り分け',
    text: '「自動の振り分け」で、拾ったときに分解するレアリティを決められます。放置しても持ち物があふれません。' },
  { id: 'goal', target: () => (isPhone() ? '.dock-strip' : '#dock'), title: '次の目標',
    text: 'ここに次の目標と、到達までの目安・手段が出ます。迷ったらここを見てください。遊び方は 設定 → 遊び方 でいつでも読めます。' },
];

export class Guide {
  constructor(ui) {
    this.ui = ui;
    this.step = -1;
    this.el = null;
    this.timer = null;
    this.onResize = () => this.place();
  }

  get active() { return this.step >= 0; }

  /** 新しく始めたときに 1 回だけ（自動テストでは出さない） */
  maybeAutoStart() {
    const st = this.ui.game.state;
    if (!st) return;
    const T = tutorialOf(st);
    if (T.guide || st.hero.level > 2 || (st.meta.rebirths || 0) > 0) return;
    if (globalThis.navigator?.webdriver) return;
    setTimeout(() => { if (this.ui.panelBody?.isConnected && !this.active && !T.guide) this.start(); }, 1500);
  }

  start(from = 0) {
    this.stop(true);
    this.step = from;
    this.el = h('div.guide', { role: 'dialog', 'aria-label': 'はじめての案内' }, [h('div.guide-ring'), h('div.guide-bubble')]);
    document.body.append(this.el);
    window.addEventListener('resize', this.onResize);
    this.timer = setInterval(() => { if (!this.ui.panelBody?.isConnected) { this.stop(true); return; } this.place(); }, 300);
    this.show();
  }

  show() {
    const s = GUIDE_STEPS[this.step];
    if (!s) { this.finish('done'); return; }
    if (s.panel && this.ui.current?.id !== s.panel) this.ui.openPanel(s.panel);
    const bub = this.el.querySelector('.guide-bubble');
    clear(bub);
    const last = this.step === GUIDE_STEPS.length - 1;
    bub.append(
      h('div.gb-step', `${this.step + 1} / ${GUIDE_STEPS.length}`),
      h('h4', s.title),
      h('p', s.text),
      h('div.gb-btns', [
        button('飛ばす', () => this.finish('skip'), { kind: 'small', class: 'gb-skip' }),
        this.step > 0 ? button('もどる', () => { this.step--; this.show(); }, { kind: 'small' }) : null,
        button(last ? 'はじめる' : '次へ', () => { this.step++; this.show(); }, { kind: 'primary', class: 'gb-next' }),
      ]),
    );
    requestAnimationFrame(() => this.place());
    this.place();
  }

  target() {
    const s = GUIDE_STEPS[this.step];
    if (!s) return null;
    const sel = typeof s.target === 'function' ? s.target() : s.target;
    const el = sel ? document.querySelector(sel) : null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }

  place() {
    if (!this.el) return;
    const ring = this.el.querySelector('.guide-ring');
    const bub = this.el.querySelector('.guide-bubble');
    const r = this.target();
    const vw = globalThis.visualViewport?.width || window.innerWidth;
    const vh = globalThis.visualViewport?.height || window.innerHeight;
    const bw = Math.min(340, vw - 24);
    bub.style.width = `${bw}px`;
    const bh = bub.offsetHeight || 160;
    if (!r) {
      ring.style.display = 'none';
      bub.style.left = `${Math.round((vw - bw) / 2)}px`; bub.style.top = `${Math.round((vh - bh) / 2)}px`;
      return;
    }
    const pad = 6;
    ring.style.display = '';
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // 吹き出しは目印の下 → 上 → 右 → 左 の順に、入る所へ
    let x = r.left; let y = r.bottom + 14;
    if (y + bh > vh - 8) y = r.top - bh - 14;
    if (y < 8) { y = Math.max(8, Math.min(vh - bh - 8, r.top)); x = r.right + 14; if (x + bw > vw - 8) x = r.left - bw - 14; }
    x = Math.max(12, Math.min(vw - bw - 12, x));
    y = Math.max(8, Math.min(vh - bh - 8, y));
    bub.style.left = `${Math.round(x)}px`; bub.style.top = `${Math.round(y)}px`;
  }

  finish(how) {
    const st = this.ui.game.state;
    if (st) tutorialOf(st).guide = how;
    this.stop(true);
    if (how === 'skip') this.ui.toast('案内は 設定 → 遊び方 からもう一度見られます');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('resize', this.onResize);
    this.el?.remove();
    this.el = null;
    this.step = -1;
  }
}

// ---------------- 設定の「遊び方」
const HOWTO = [
  ['基本の流れ', [
    '主人公は自動で歩いて戦い、スキルも左から順に自動で使います。手を離していても進みます。',
    `1 つの地域は 10 ステージ（各 ${WAVES_PER_STAGE} 波）。10 番目がボスで、倒すと次の地域が開きます。倒れても、ステージの ${WAVE_CHECKPOINT} 波ごとの区切りから続きます。`,
    'ボスに負けると「自動前進」が OFF になり、手前で稼ぎ直します。はじめて負けると「再挑戦の誓い」が開き、火力が足りたとき（届かなくても数分ごと）に自動で挑み直します。すぐ挑むときは「ボスに挑む」を押します。',
    'ブラウザを閉じていた間も稼ぎます（はじめは 8 時間まで。転生で延びます）。',
  ]],
  ['装備とレアリティ', [
    'レアリティは 8 段階。色に加えて、マスの左下の 1 文字でも分かります（下の表）。',
    '覚醒（★）・極致（✦）は品質の上乗せで、オプションの数値がさらに高くなります。',
    '▲ は今の装備より強くなりそうな印。押すと「火力 ▲12% ／ 耐久 ▼3%」のように実際の計算で比べます。',
    '持ち物の「自動の振り分け」で、拾ったときに分解するレアリティを決められます。鍵をかけた物は分解・売却されません。',
  ]],
  ['強くなる', [
    'スキル: ポイントで強化。ルーンで動きが変わり、補助の刻印で効果が増えます。',
    'パッシブ: レベルごとの点を星座盤に振ります。Lv 100 からはアビスLv が上がり、4 つの盤に点を振ります。',
    '鍛冶: 強化（+1〜+20）・段上げ・付け替えなど。費用と確率は先に表示され、失敗しても壊れません。',
    '宝石・極意・商人: 遊ぶうちに順に開きます（タブに NEW が付きます）。',
  ]],
  ['深く潜る', [
    '転生: 第五章のボスを倒すと開きます。物語の進みとお金を手放して魂を得て、魂の祭壇で永続の強化と自動化を買います。',
    '魔境 I〜XVI: 物語を踏破すると開く難しさの段です。段を上げるほど報酬が増えます。',
    '深淵の裂け目: 段階に上限のない挑戦です。門番は魔境で集めた欠片で呼ぶ強敵です。',
  ]],
  ['このゲームについて', [
    '課金・広告・スタミナはありません。速さ（×1〜×4）も遊びで解放します。',
    '音と絵はすべてコードで作っています。画像は「画像」の窓から、ほかの AI で作った物に差し替えられます。',
  ]],
];

export function howtoSection(ui) {
  const sec = h('section.sec.howto');
  sec.append(h('h3.sec-title', ['遊び方', h('span.sec-right', button('案内をもう一度見る', () => ui.guide.start(), { kind: 'small' }))]));
  for (const [title, lines] of HOWTO) {
    sec.append(h('details.ht', { open: title === '基本の流れ' || undefined }, [h('summary', title), h('ul', lines.map((t) => h('li', t)))]));
  }
  sec.append(h('details.ht', [h('summary', 'レアリティの見分け方'), h('div.ht-rar', RARITIES.map((r) => h('div.ht-r', [h('span.rmark', { style: { '--rc': r.color } }, RARITY_MARK[r.id] || ''), h('span', { style: { color: r.color } }, r.name)])))]));
  sec.append(h('details.ht', { open: !isPhone() || undefined }, [
    h('summary', 'キー操作（パソコン）'),
    h('table.kv.keys', SHORTCUTS.map((s) => h('tr', [h('th', h('kbd', s.key)), h('td', s.label)]))),
  ]));
  return sec;
}
