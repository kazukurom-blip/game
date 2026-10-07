// 音（仮）。何も鳴らさない。サウンド担当がこの 2 つの関数の中身を作る。
// 呼ばれた記録だけ残す（テストで「呼ばれたか」を確かめられる）。
export const audioLog = [];

export function playBgm(id) {
  audioLog.push({ t: 'bgm', id });
  if (audioLog.length > 200) audioLog.shift();
}

export function playSfx(id) {
  audioLog.push({ t: 'sfx', id });
  if (audioLog.length > 200) audioLog.shift();
}
