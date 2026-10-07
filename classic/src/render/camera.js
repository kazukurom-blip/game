// カメラ: 主人公を追い、マップの端で止まる。横はすぐ、縦は少し遅れて追う（FEEL.md）
import { FEEL } from '../engine/feel.js';

export const VIEW_W = 800, VIEW_H = 600;

export class Camera {
  constructor(map) { this.map = map; this.x = 0; this.y = 0; }
  target(p) {
    return { x: p.x - VIEW_W / 2, y: p.y - VIEW_H / 2 - FEEL.camOffsetY + 0 };
  }
  clamp() {
    this.x = Math.max(0, Math.min(this.map.width - VIEW_W, this.x));
    this.y = Math.max(0, Math.min(this.map.height - VIEW_H, this.y));
  }
  snap(p) { const t = this.target(p); this.x = t.x; this.y = t.y; this.clamp(); }
  update(p, dt) {
    const t = this.target(p);
    this.x += (t.x - this.x) * (1 - Math.exp(-FEEL.camFollowX * dt));
    // 縦: 小さなずれ（ジャンプ）では動かない
    const dy = t.y - this.y;
    if (Math.abs(dy) > FEEL.camDeadY) {
      const goal = t.y - Math.sign(dy) * FEEL.camDeadY;
      this.y += (goal - this.y) * (1 - Math.exp(-FEEL.camFollowY * dt));
    }
    this.clamp();
  }
}
