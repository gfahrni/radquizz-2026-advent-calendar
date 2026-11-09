#!/usr/bin/env python3
"""
Génère l'aperçu LinkedIn du site : assets/og-image.png (1200 x 630).

    python3 tools/make-og.py

Le rendu suit le thème de Noël : fond vert nuit, guirlande, flocon doré,
titre en serif. À relancer après un changement de nom ou de période.
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "og-image.png"

W, H = 1200, 630
SS = 2                      # supersampling pour des bords nets

BG = (15, 29, 22)           # #0f1d16
BG_TOP = (27, 53, 39)       # #1b3527
INK = (245, 242, 233)       # #f5f2e9
MUTED = (194, 211, 198)     # #c2d3c6
GOLD = (232, 195, 122)      # #e8c37a
RED = (200, 16, 46)         # #c8102e
GREEN = (47, 143, 78)       # #2f8f4e

SERIF = "/System/Library/Fonts/NewYork.ttf"
SANS = "/System/Library/Fonts/SFNS.ttf"


def font(path, size):
    return ImageFont.truetype(path, size * SS)


def background():
    """Dégradé vertical + halo vert en haut du cadre."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (yy / (H - 1)) ** 0.85
    img = np.zeros((H, W, 3), dtype=np.float32)
    for i in range(3):
        img[..., i] = BG_TOP[i] * (1 - t) + BG[i] * t

    glow = np.exp(-(((xx - W / 2) ** 2) / (2 * (W * 0.42) ** 2)
                    + ((yy + 120) ** 2) / (2 * (H * 0.75) ** 2)))
    for i in range(3):
        img[..., i] += glow * 12

    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize(
        (W * SS, H * SS), Image.LANCZOS)


def garland(draw):
    """Bande de guirlande en haut : rouge / or / vert."""
    seg, gap, height = 22 * SS, 6 * SS, 10 * SS
    palette = [RED, GOLD, GREEN]
    x = 0
    i = 0
    while x < W * SS:
        draw.rectangle([x, 0, x + seg, height], fill=palette[i % 3])
        x += seg + gap
        i += 1


def snow(draw):
    """Flocons discrets, répartis de façon reproductible."""
    rng = random.Random(20261201)
    for _ in range(110):
        x = rng.uniform(0, W) * SS
        y = rng.uniform(40, H) * SS
        r = rng.choice([.8, 1, 1, 1.5, 1.8]) * SS
        a = rng.randint(22, 85)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))


def snowflake(draw, cx, cy, r, color, width):
    """Flocon à six branches, avec deux petites ramifications par branche."""
    for k in range(6):
        a = math.radians(60 * k - 90)
        ex, ey = cx + r * math.cos(a), cy + r * math.sin(a)
        draw.line([cx, cy, ex, ey], fill=color, width=width)
        for frac in (.55, .78):
            bx, by = cx + r * frac * math.cos(a), cy + r * frac * math.sin(a)
            for s in (-38, 38):
                aa = a + math.radians(s)
                draw.line([bx, by,
                           bx + r * .26 * math.cos(aa),
                           by + r * .26 * math.sin(aa)],
                          fill=color, width=width)


def tracked(draw, xy, text, fnt, fill, tracking):
    """Écrit du texte avec un interlettrage, et renvoie la largeur totale."""
    total = sum(draw.textlength(c, font=fnt) for c in text) + tracking * (len(text) - 1)
    x, y = xy
    for c in text:
        draw.text((x, y), c, font=fnt, fill=fill)
        x += draw.textlength(c, font=fnt) + tracking
    return total


def main():
    img = background().convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    snow(draw)
    garland(draw)

    cx = W * SS / 2

    # flocon doré, avec un cœur rouge
    snowflake(draw, cx, 150 * SS, 44 * SS, GOLD + (235,), 2 * SS)
    draw.ellipse([cx - 5 * SS, 145 * SS, cx + 5 * SS, 155 * SS], fill=RED + (255,))

    # titre
    f_title = font(SERIF, 96)
    title = "RadQuizz"
    tw = draw.textlength(title, font=f_title)
    draw.text((cx - tw / 2, 218 * SS), title, font=f_title, fill=INK)

    # filet
    draw.rectangle([cx - 34 * SS, 358 * SS, cx + 34 * SS, 360 * SS], fill=GOLD + (200,))

    # surtitre
    f_kick = font(SANS, 27)
    kick = "CALENDRIER DE L'AVENT 2026"
    kw = sum(draw.textlength(c, font=f_kick) for c in kick)
    tracked(draw, (cx - kw / 2, 392 * SS), kick, f_kick, GOLD + (255,), 4 * SS)

    # sous-titre
    f_sub = font(SANS, 25)
    sub = "Un cas radiologique par jour  ·  1er – 24 décembre"
    sw = draw.textlength(sub, font=f_sub)
    draw.text((cx - sw / 2, 452 * SS), sub, font=f_sub, fill=MUTED + (255,))

    # adresse du site, discrète
    f_url = font(SANS, 18)
    url = "gfahrni.github.io/radquizz-2026-advent-calendar"
    uw = draw.textlength(url, font=f_url)
    draw.text((cx - uw / 2, 552 * SS), url, font=f_url, fill=MUTED + (135,))

    out = Image.alpha_composite(img, layer).convert("RGB")
    out = out.resize((W, H), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)} — {W}×{H}, {OUT.stat().st_size / 1024:.0f} Ko")


if __name__ == "__main__":
    main()
