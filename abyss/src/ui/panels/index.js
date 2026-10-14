// 窓（パネル）の並び。順番がそのままタブの順。担当が作ったパネルをここに足す。
import { heroPanel } from './hero.js';
import { bagPanel } from './bag.js';
import { skillsPanel } from './skills.js';
import { mapPanel } from './map.js';
import { settingsPanel } from './settings.js';
import { assetsPanel } from './assets.js';

export const PANELS = [
  heroPanel,
  bagPanel,
  skillsPanel,
  mapPanel,
  assetsPanel,
  settingsPanel,
];
