// 仕組み（システム）の一覧。Game が順に作り、game.sys.<id> で呼べるようにする。
// 新しい仕組みを足すときは、ファイルを作ってここに 1 行足す。
import { WorldSystem } from './world.js';
import { InventorySystem } from './inventory.js';
import { SkillSystem } from './skillbook.js';
import { OfflineSystem } from './offline.js';
import { CraftingSystem } from './crafting.js';
import { GemSystem } from './gems.js';
import { CodexSystem } from './codex.js';
import { MerchantSystem } from './merchant.js';
import { TreeSystem } from './skilltree.js';
import { RiftSystem } from './rift.js';
import { PrestigeSystem } from './prestige.js';
import { AchievementSystem } from './achievements.js';
import { BestiarySystem } from './bestiary.js';
import { BountySystem } from './bounties.js';
import { PetSystem } from './pets.js';

export const SYSTEMS = [
  WorldSystem, InventorySystem, SkillSystem, OfflineSystem,
  CraftingSystem, GemSystem, CodexSystem, MerchantSystem,
  TreeSystem, RiftSystem,
  PrestigeSystem, AchievementSystem, BestiarySystem, BountySystem, PetSystem,
];
