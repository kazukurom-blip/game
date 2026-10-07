// テスト用のマップ: 芽吹きの島の狩り場の雰囲気（段々の足場・縄 1 本・はしご 1 本・坂）
// 段差は 64 px（ジャンプ 約 77 px で上がれる）。80 px 以上は縄・はしごで上がる。
export default {
  id: 'T001',
  name: '試しの丘',
  area: '芽吹きの島',
  width: 1800,
  height: 720,
  bgm: 'island_field',
  background: [
    { layer: 'sky', parallax: 0, top: '#5fb4f0', bottom: '#d6f0ff' },
    { layer: 'clouds', parallax: 0.05, y: 60 },
    { layer: 'sea', parallax: 0.08, y: 390 },
    { layer: 'mountains', parallax: 0.1, y: 300 },
    { layer: 'hills', parallax: 0.3, y: 400 },
    { layer: 'trees', parallax: 0.6, y: 470 },
  ],
  footholds: [
    // 地面: 平ら → 上り坂 → 台地 → 下り坂 → 平ら
    { id: 'ground', ground: true, points: [[0, 640], [680, 640], [776, 592], [1220, 592], [1284, 624], [1800, 624]] },
    // 左の段々
    { id: 'step1', points: [[160, 576], [480, 576]] },
    { id: 'step2', points: [[320, 512], [640, 512]] },
    // 台地の上の高い足場（はしごで上がる）
    { id: 'high', points: [[860, 440], [1180, 440]] },
    // 右の段々
    { id: 'step3', points: [[1300, 560], [1420, 560]] },
    { id: 'step4', points: [[1460, 496], [1700, 496]] },
  ],
  ropes: [
    { x: 600, top: 512, bottom: 616 },              // 縄: 地面 → step2
    { x: 1000, top: 440, bottom: 588, ladder: true }, // はしご: 台地 → high
  ],
  portals: [
    { name: 'sp', type: 'spawn', x: 90, y: 640 },
    { name: 'east', type: 'visible', x: 1750, y: 624, to: 'T002', toPortal: 'west' },
  ],
};
