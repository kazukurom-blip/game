// 音（効果音・BGM）。担当: サウンド担当がこのファイルを本格的にする（WebAudio で音を作る）。
// 使い方: audio.init(game) / audio.play('hit', { el: 'fire' }) / audio.music('act1') / audio.setVolumes(sfx, bgm)
// 差し替え: 画像と同じく枠 ID（sfx.<id> / bgm.<id>）で音声ファイルを入れられるようにする予定。

export const audio = {
  ctx: null,
  game: null,
  init(game) { this.game = game; },
  unlock() {},
  play() {},
  music() {},
  setVolumes() {},
};
