// 芽吹きの島（S000〜S011）の足場。チュートリアル（S-01〜S-20）の場面に合わせて手で置いた物（生成器は使わない）。
// 検査（check.mjs）は全マップと同じに通す。ポータルの名前は to_<行き先>。
export const G = 640; // 地面の高さ

export const ISLAND = {
  S000: { width: 1400, footholds: [{ id: 'g', ground: true, points: [[0, G], [1400, G]] }, { id: 'rock', points: [[620, 600], [680, 600]] }],
    walls: [{ x: 620, top: 600, bottom: G }, { x: 680, top: 600, bottom: G }], portals: { S001: 1350 }, spawn: 120, bg: 'beach',
    objects: [] },
  S001: { width: 1800, footholds: [{ id: 'g', ground: true, points: [[0, G], [1800, G]] }, { id: 'step', points: [[780, 592], [1080, 592]] }, { id: 'upper', points: [[1200, 512], [1560, 512]] }],
    ropes: [{ x: 1340, top: 512, bottom: 616 }], portals: { S000: 60, S002: 1740 }, bg: 'grass',
    spawns: [['M001', 320], ['M001', 700], ['M001', 900, 592], ['M001', 1500]], mobMax: 6,
    objects: [{ id: 'S001.crate', name: '木箱', x: 1480, y: 512 }] },
  S002: { width: 2000, footholds: [{ id: 'g', ground: true, points: [[0, G], [2000, G]] }, { id: 'hill', points: [[560, 496], [1100, 496]] }],
    ropes: [{ x: 700, top: 496, bottom: 624, ladder: true }], portals: { S001: 60, S003: 1940 }, bg: 'grass',
    spawns: [['M001', 400], ['M002', 900], ['M002', 1300], ['M001', 800, 496], ['M002', 1000, 496], ['M002', 1600]], mobMax: 8 },
  S003: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [1400, G], [1500, 620], [2400, 620]] }, { id: 'roof', points: [[1550, 556], [1850, 556]] }],
    portals: { S002: 60, S004: 300, S011: 1000, S010: 2150, S006: 2340 }, spawn: 1200, town: 1200, bg: 'village' },
  S004: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [2400, G]] }, { id: 'f1', points: [[400, 576], [800, 576]] }, { id: 'f2', points: [[1200, 576], [1700, 576]] }, { id: 'f3', points: [[1800, 512], [2200, 512]] }],
    // f3（地面から 128 px）は縄で上る（検査で「行けない足場」になっていたので縄を足した）
    ropes: [{ x: 2100, top: 512, bottom: 620 }],
    portals: { S003: 60, S005: 2340 }, bg: 'field',
    spawns: [['M001', 300], ['M002', 600], ['M002', 600, 576], ['M003', 1000], ['M003', 1400, 576], ['M002', 1600], ['M003', 2000, 512], ['M001', 2100]], mobMax: 10 },
  // root1 は地面から 80 px で跳んで届かなかったので 64 px（576）に下げた
  S005: { width: 2400, footholds: [{ id: 'g', ground: true, points: [[0, G], [600, G], [664, 608], [1300, 608], [1364, G], [2400, G]] }, { id: 'root1', points: [[300, 576], [600, 576]] }, { id: 'root2', points: [[800, 544], [1150, 544]] }, { id: 'root3', points: [[1500, 576], [1900, 576]] }],
    portals: { S004: 60, S007: 1000, S008: 2340 }, bg: 'forest',
    spawns: [['M003', 400], ['M003', 450, 576], ['M005', 900, 544], ['M005', 1200], ['M003', 1600, 576], ['M005', 1800], ['M005', 2100]], mobMax: 10 },
  S006: { width: 1800, footholds: [{ id: 'g', ground: true, points: [[0, G], [1800, G]] }, { id: 't1', points: [[200, 520], [1600, 520]] }, { id: 't2', points: [[300, 400], [1400, 400]] }, { id: 't3', points: [[500, 280], [1250, 280]] }],
    ropes: [{ x: 420, top: 520, bottom: 616 }, { x: 900, top: 400, bottom: 500 }, { x: 700, top: 280, bottom: 380 }],
    portals: { S003: 60, S008: [1200, 280] }, bg: 'cliff',
    spawns: [['M004', 500], ['M004', 1200], ['M004', 600, 520], ['M005', 1100, 520], ['M004', 1400, 520], ['M005', 500, 400], ['M004', 1000, 400], ['M005', 1200, 400], ['M004', 800, 280], ['M005', 1000, 280]], mobMax: 12 },
  S007: { width: 1800, footholds: [{ id: 'g', ground: true, points: [[0, G], [1800, G]] }, { id: 'pond', points: [[600, 576], [1000, 576]] }, { id: 'room', points: [[1500, 300], [1760, 300]] }],
    walls: [{ x: 1500, top: 200, bottom: 300 }, { x: 1760, top: 200, bottom: 300 }],
    portals: { S005: 60 }, bg: 'pond', extraPortals: [
      { name: 'secret', type: 'hidden', x: 1720, y: G, toPortal: 'room' },
      { name: 'room', type: 'visible', x: 1540, y: 300, toPortal: 'secret' },
    ],
    spawns: [['M005', 400], ['M005', 700, 576], ['M006', 900, 576], ['M005', 1200], ['M006', 1400], ['M006', 300]], mobMax: 8,
    objects: [{ id: 'S007.box', name: 'ゲン爺の箱', x: 1680, y: 300 }] },
  S008: { width: 2000, footholds: [{ id: 'g', ground: true, points: [[0, G], [500, G], [700, 540], [1300, 540], [1500, G], [2000, G]] }],
    portals: { S005: 60, S006: [1000, 540], S009: 1940 }, bg: 'highland',
    spawns: [['M006', 300], ['M006', 800, 540], ['M004', 1150, 540], ['M006', 1700], ['M004', 1850]], mobMax: 8,
    objects: [{ id: 'S008.view', name: '見晴らし台', x: 900, y: 540 }, { id: 'S008.stele', name: '古い石碑', x: 1200, y: 540 }] },
  S009: { width: 2200, footholds: [{ id: 'g', ground: true, points: [[0, G], [2200, G]] }, { id: 'rock', points: [[900, 576], [1200, 576]] }],
    portals: { S008: 60 }, bg: 'beach',
    spawns: [['M004', 400], ['M006', 700], ['M004', 1000, 576], ['M006', 1400], ['M004', 1800]], mobMax: 8,
    timed: [['M007', 1600, G, 600]] },
  S010: { width: 1200, footholds: [{ id: 'g', ground: true, points: [[0, G], [1200, G]] }], portals: { S003: 60 }, bg: 'pier' },
  S011: { width: 1000, footholds: [{ id: 'g', ground: true, points: [[0, G], [1000, G]] }], portals: { S003: 60 }, bg: 'room' },
};

// BGM（SOUND.md 1-6）
export const ISLAND_BGM = { S003: 'town_beginner', S010: 'town_beginner', S011: 'town_beginner' };
