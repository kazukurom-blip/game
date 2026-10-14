// 窓（パネル）の並び。順番がそのままタブの順。担当はそれぞれのパネルのファイルの中身を作る（この一覧は触らない）。
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
