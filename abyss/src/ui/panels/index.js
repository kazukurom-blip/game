// 窓（パネル）の一覧。担当はそれぞれのパネルのファイルの中身を作る（この一覧は UI 担当）。
// タブの並び（5 つのまとまり）は ui/nav.js の NAV_GROUPS、少しずつ開く条件は ui/unlocks.js。
import { heroPanel } from './hero.js';
import { bagPanel } from './bag.js';
import { skillsPanel } from './skills.js';
import { treePanel } from './tree.js';
import { craftPanel } from './craft.js';
import { gemsPanel } from './gems.js';
import { codexPanel } from './codex.js';
import { merchantPanel } from './merchant.js';
import { mapPanel } from './map.js';
import { riftPanel } from './rift.js';
import { prestigePanel } from './prestige.js';
import { petsPanel } from './pets.js';
import { bountiesPanel } from './bounties.js';
import { achievementsPanel } from './achievements.js';
import { bestiaryPanel } from './bestiary.js';
import { statsPanel } from './stats.js';
import { assetsPanel } from './assets.js';
import { settingsPanel } from './settings.js';

export const PANELS = [
  heroPanel, bagPanel, skillsPanel, treePanel,
  craftPanel, gemsPanel, codexPanel, merchantPanel,
  mapPanel, riftPanel, prestigePanel,
  petsPanel, bountiesPanel, achievementsPanel, bestiaryPanel, statsPanel,
  assetsPanel, settingsPanel,
];

// キー操作（ui/keys.js と同じ）。タブの説明に出す
const KEYS = { hero: 'I', bag: 'B', skills: 'K', tree: 'P', map: 'M' };
// 説明（？）の無い窓に足す
const HELP = {
  stats: '<p>これまでの記録（倒した数・拾った数・時間）と、この周回の記録です。</p><p>「能力の内訳」では、それぞれの能力がどこから来ているか（装備・星座盤・実績・ペットなど）が分かります。「スキル別」はスキルごとのダメージの割合です。</p>',
};
for (const p of PANELS) {
  if (KEYS[p.id] && !p.key) p.key = KEYS[p.id];
  if (!p.help && HELP[p.id]) p.help = HELP[p.id];
}
