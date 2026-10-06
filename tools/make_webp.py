#!/usr/bin/env python3
"""assets/sprites/ の PNG から、読み込み用の軽い WebP を横に作る（PNG は元の画像としてそのまま残す）。

  python3 tools/make_webp.py          # 変わった PNG だけ作り直す
  python3 tools/make_webp.py --all    # 全部作り直す

- 色替え・印（マゼンタ）・素体の色を読む画像（リグのパーツ・顔と髪・乗り物・装備アイコン）は、
  色を一切変えない可逆の WebP（lossless）。
- それ以外（背景・地面・敵・ボス・ペット・消耗品とスキルのアイコン・タイトル）は、
  少しだけ画質を落とす WebP（quality 90、透明度はそのまま）。
- 対応表 assets/sprites/webp.json = { "<PNG の相対パス>": "<PNG の md5 の先頭 8 文字>" }。
  ゲームは、この表にあって md5 が今の PNG と一致する物だけ WebP を読む（tests/unit.mjs が食い違いを検査）。
  PNG を差し替えたら、このスクリプトを流し直すこと（tools/check_art.mjs --install の後など）。
"""
import hashlib, json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
MAP = os.path.join(ROOT, 'webp.json')
LOSSLESS = ('rig/', 'heads/', 'vehicles/', 'icons/equip/')


def md5_8(path):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


def main():
    full = '--all' in sys.argv
    old = {}
    if os.path.exists(MAP) and not full:
        with open(MAP) as f:
            old = json.load(f)
    out, made, kept, png_total, webp_total = {}, 0, 0, 0, 0
    for d, _, files in os.walk(ROOT):
        for fn in sorted(files):
            if not fn.endswith('.png'):
                continue
            p = os.path.join(d, fn)
            rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
            w = p[:-4] + '.webp'
            h = md5_8(p)
            if old.get(rel) == h and os.path.exists(w):
                kept += 1
            else:
                im = Image.open(p)
                im.load()
                if rel.startswith(LOSSLESS):
                    im.save(w, 'WEBP', lossless=True, method=6)
                else:
                    im.save(w, 'WEBP', quality=90, alpha_quality=100, method=6)
                made += 1
            # WebP の方が大きくなる物（ごく小さい画像など）は使わない
            if os.path.getsize(w) >= os.path.getsize(p):
                os.remove(w)
                continue
            out[rel] = h
            png_total += os.path.getsize(p)
            webp_total += os.path.getsize(w)
    # PNG が無くなった WebP を消す
    for d, _, files in os.walk(ROOT):
        for fn in files:
            if fn.endswith('.webp'):
                rel = os.path.relpath(os.path.join(d, fn), ROOT).replace(os.sep, '/')
                if rel[:-5] + '.png' not in out:
                    os.remove(os.path.join(d, fn))
    with open(MAP, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f'WebP: {len(out)} 枚（作成 {made}・そのまま {kept}）  PNG {png_total / 1e6:.1f}MB → WebP {webp_total / 1e6:.1f}MB')


if __name__ == '__main__':
    main()
