// コードで描く絵の登録。種類ごとのファイルに分けてあり、ここでまとめて assets に登録する。
// 同じ prefix は後から登録した物で置き換える（より長い prefix が優先）。
import { assets } from '../assets.js';
import { paintFxSlot } from './fxsprites.js';
import { paintHeroSlot, paintPortrait } from './heroes.js';
import { paintBackground } from './backgrounds.js';
import { paintLogo, paintTitle, paintUiMisc } from './ui.js';
import { paintItemIcon, paintMaterialIcon, paintGemIcon, paintRuneIcon, paintSkillIcon, paintGenericIcon } from './icons.js';
import { paintMonsterSlot, paintMinionSlot, paintPetSlot } from './monsters.js';
import { paintWeaponSlot, paintOffhandSlot, paintHelmSlot, paintArmorPart, paintUniqueSlot, paintGearMisc, WEAPON_KINDS_ALL, OFFHAND_KINDS_ALL } from './gear.js';

function reg(prefix, fn) {
  assets.painters = assets.painters.filter((p) => p.prefix !== prefix);
  assets.addPainter(prefix, fn);
}

export function installPainters() {
  reg('gear', paintGearMisc);
  reg('hero', (ctx, spec, w, h) => (spec.id.endsWith('.portrait') ? paintPortrait(ctx, spec, w, h) : paintHeroSlot(ctx, spec, w, h)));
  for (const k of WEAPON_KINDS_ALL) reg(`gear.${k}`, paintWeaponSlot);
  for (const k of OFFHAND_KINDS_ALL) reg(`gear.${k}`, paintOffhandSlot);
  reg('gear.helm', paintHelmSlot);
  for (const s of ['chest', 'gloves', 'belt', 'legs', 'boots']) reg(`gear.${s}`, paintArmorPart);
  reg('gear.u', paintUniqueSlot);
  reg('monster', paintMonsterSlot);
  reg('minion', paintMinionSlot);
  reg('pet', paintPetSlot);
  reg('icon', paintGenericIcon);
  reg('icon.item', paintItemIcon);
  reg('icon.mat', paintMaterialIcon);
  reg('icon.gem', paintGemIcon);
  reg('icon.rune', paintRuneIcon);
  reg('icon.skill', paintSkillIcon);
  reg('fx', paintFxSlot);
  reg('bg', paintBackground);
  reg('ui', (ctx, spec, w, h) => (spec.id === 'ui.title' ? paintTitle(ctx, spec, w, h) : spec.id === 'ui.logo' ? paintLogo(ctx, spec, w, h) : paintUiMisc(ctx, spec, w, h)));
  // ウェブフォントが後から届いたらロゴを描き直す
  try {
    globalThis.document?.fonts?.load?.('800 100px "Shippori Mincho B1"').then(() => { assets.cache.delete('ui.logo'); }).catch(() => {});
  } catch { /* フォントの API が無い */ }
}
