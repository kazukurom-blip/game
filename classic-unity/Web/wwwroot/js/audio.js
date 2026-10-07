// 音: BGM（イントロ → ループ）・ジングル・効果音。どの音を鳴らすかは audio_manifest.json の events の表どおり
// （classic/src/audio/events.js が書き出した物。Unity 側と同じ決め方）。
// 効果音は sfx.json（ID → base64 の ogg）を 1 つにまとめて持ち、初めて鳴らす時に decode する。
// ブラウザは操作の前に音を出せないので、最初のキー・クリックで AudioContext を起こす。

export class Audio {
  constructor(manifest, sfxPack, data) {
    this.m = manifest;
    this.pack = sfxPack || {};
    this.data = data;              // { skills, monsters }（skill / mobSize の決め方に使う）
    this.ctx = null;
    this.buffers = new Map();      // id → Promise<AudioBuffer>
    this.bgmId = null; this.bgmNodes = [];
    this.vol = { bgm: 0.5, sfx: 0.7, muted: false };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem('lumina.audio') || '{}')); } catch { /* 無くてよい */ }
    this.frameSet = new Set();
    this.climbT = 0;
    this.mobMotion = new Map();
    this.weapon = '素手';
    this.wantBgm = null;
    this.played = []; this.seen = new Set(); // 確かめ用: 鳴った物（played は最後の 300 個・seen は全部の種類）
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain(); this.bgmGain.connect(this.master);
      this.duck = this.ctx.createGain(); this.duck.connect(this.bgmGain);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.applyVolume();
      if (this.wantBgm) { const id = this.wantBgm; this.bgmId = null; this.playBgm(id); }
    } catch (e) { console.warn('音が使えない', e); this.ctx = null; }
  }

  applyVolume() {
    try { localStorage.setItem('lumina.audio', JSON.stringify(this.vol)); } catch { /* */ }
    if (!this.ctx) return;
    this.master.gain.value = this.vol.muted ? 0 : 1;
    this.bgmGain.gain.value = this.vol.bgm;
    this.sfxGain.gain.value = this.vol.sfx;
  }

  load(path) {
    let p = this.buffers.get(path);
    if (p) return p;
    p = (async () => {
      let buf;
      if (path.startsWith('SFX/')) {
        const id = path.slice(4, -4);
        const b64 = this.pack[id];
        if (!b64) throw new Error('効果音が無い: ' + id);
        const bin = atob(b64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        buf = u.buffer;
      } else {
        const r = await fetch('audio/' + path);
        if (!r.ok) throw new Error('音が無い: ' + path);
        buf = await r.arrayBuffer();
      }
      return await this.ctx.decodeAudioData(buf);
    })();
    p.catch(() => {});
    this.buffers.set(path, p);
    return p;
  }

  // ---------------- BGM
  playBgm(id) {
    this.wantBgm = id;
    if (!this.ctx || id === this.bgmId) return;
    this.stopBgm();
    this.bgmId = id;
    const e = this.m.bgm[id] || this.m.bgm[this.m.bgmFallback?.[id]];
    if (!e) return;
    const token = {}; this.bgmToken = token;
    Promise.all([e.intro ? this.load(e.intro) : null, this.load(e.file)]).then(([intro, loop]) => {
      if (this.bgmToken !== token) return;
      const t0 = this.ctx.currentTime + 0.05;
      let t = t0;
      if (intro) {
        const s = this.ctx.createBufferSource(); s.buffer = intro; s.connect(this.duck); s.start(t0);
        this.bgmNodes.push(s);
        t = t0 + (e.introSamples ? e.introSamples / (e.sampleRate || intro.sampleRate) : intro.duration);
      }
      const l = this.ctx.createBufferSource(); l.buffer = loop; l.loop = true;
      if (e.loopSamples) { l.loopStart = 0; l.loopEnd = e.loopSamples / (e.sampleRate || loop.sampleRate); }
      l.connect(this.duck); l.start(t);
      this.bgmNodes.push(l);
    }).catch((err) => console.warn(String(err)));
  }

  stopBgm() {
    for (const n of this.bgmNodes) { try { n.stop(); } catch { /* */ } }
    this.bgmNodes = []; this.bgmId = null; this.bgmToken = null;
  }

  jingle(id) {
    const e = this.m.jingle[id];
    if (!e || !this.ctx) return;
    this.load(e.file).then((buf) => {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.bgmGain);
      const now = this.ctx.currentTime;
      this.duck.gain.cancelScheduledValues(now);
      this.duck.gain.setTargetAtTime(0.2, now, 0.05);
      this.duck.gain.setTargetAtTime(1, now + buf.duration, 0.4);
      s.start();
    }).catch(() => {});
  }

  // ---------------- 効果音
  sfx(id) {
    if (!id || !this.ctx || this.frameSet.has(id)) return;
    this.frameSet.add(id);
    this.played.push(id); this.seen.add(id); if (this.played.length > 300) this.played.shift(); // 確かめ用（tools/playtest.mjs が読む）
    const e = this.m.sfx[id];
    if (!e) return;
    this.load(e.file).then((buf) => {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.sfxGain); s.start();
    }).catch(() => {});
  }

  // 表の値（文字・null・byId/byValue/byText・rule）を音の ID にする
  resolve(v, ev, extra) {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    const E = this.m.events;
    if (v.rule === 'weapon') return E.weaponSfx[this.weapon] || v.default || null;
    if (v.rule === 'skill') return this.skillSfx(ev) || v.default || null;
    if (v.rule === 'mobSize') return this.mobSizeSfx(ev[1]);
    if (v.rule === 'status') {
      if (v.onlyPlayer && ev[2] !== 0) return null;
      return v.fixed || E.statusSfx[ev[1]] || v.default || null;
    }
    if (v.byId) { const k = Object.keys(v.byId).find((k) => (ev[1] || '').startsWith(k)); if (k) return this.resolve(v.byId[k], ev, extra); }
    if (v.byValue) { const k = String(ev[2]); if (k in v.byValue) return this.resolve(v.byValue[k], ev, extra); }
    if (v.byText) { const k = Object.keys(v.byText).find((k) => (ev[5] || '').startsWith(k)); if (k) return this.resolve(v.byText[k], ev, extra); }
    return v.default === undefined ? null : this.resolve(v.default, ev, extra);
  }

  skillSfx(ev) {
    const S = this.m.events.skillSfx;
    const sk = this.data.skills[ev[1]];
    for (const key of S.order) {
      let id = null;
      if (key === 'element') id = sk && sk.element && S.element[sk.element];
      else if (key === 'kind') id = sk && S.kind[sk.kind];
      else if (key === 'motion') id = sk && sk.motion && S.motion[sk.motion];
      else if (key === 'projectile') id = ev[5] && S.projectile[ev[5]];
      else if (key === 'weapon') id = S.weapon[this.weapon];
      if (id) return id;
    }
    return S.default;
  }

  mobSizeSfx(mobId) {
    const Z = this.m.events.mobSize;
    const m = this.data.monsters[mobId];
    if (!m) return Z.small;
    if (m.boss || m.kind === 'boss' || m.kind === 'raid') return Z.large;
    if (m.kind === 'tough' || m.kind === 'elite' || (m.height || 0) >= Z.mediumHeight) return Z.medium;
    return Z.small;
  }

  // 1 フレームのお知らせ・ダメージの数字・体の状態から鳴らす
  onFrame(f, dt) {
    this.frameSet.clear();
    if (!this.ctx) return;
    const E = this.m.events;
    const crit = f.dm.some((d) => d[0] === 1);
    for (const ev of f.ev) {
      const type = ev[0];
      let id = this.resolve(E.sfx[type], ev);
      if (type === 'MobHit' && id === 'hit' && crit) id = 'crit';
      this.sfx(id);
      const j = this.resolve(E.jingle[type], ev);
      if (j) this.jingle(j);
    }
    // はしご・縄を上り下りしている間
    const st = f.p[9], climbing = f.p[10];
    if ((st === 4 || st === 5) && climbing) {
      this.climbT -= dt;
      if (this.climbT <= 0) { this.sfx(st === 5 ? E.climb.ladder : E.climb.rope); this.climbT = E.climb.intervalSec; }
    } else this.climbT = 0;
    // 敵の構え
    const seen = new Map();
    for (const m of f.mo) {
      const prev = this.mobMotion.get(m[0]);
      if (m[5] !== prev && E.mobMotion[m[5]]) this.sfx(E.mobMotion[m[5]]);
      seen.set(m[0], m[5]);
    }
    this.mobMotion = seen;
  }
}
