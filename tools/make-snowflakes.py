#!/usr/bin/env python3
"""
Generate the snowflake SVGs used by the snowfall (assets/neige/).

    python3 tools/make-snowflakes.py

Each file holds ONE six-branch snowflake, framed as tightly as possible in
a 72-unit square. The canvas in assets/theme.js scales it freely (13–40 px),
which is why the frame has to be tight: otherwise the strokes turn into
hairs at small sizes.
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "neige"

SIZE = 72          # viewBox side
CENTER = SIZE / 2
RADIUS = 27        # flake radius, leaves 9 units of margin
STROKE = 2.8


def branches(kind, r):
    """Branch twigs in local coordinates (branch pointing up)."""
    segments = []
    if kind == 1:
        for frac, length in ((0.44, 0.30), (0.68, 0.22)):
            y = -r * frac
            for side in (-1, 1):
                segments.append((0, y, side * r * length, y - r * length * 0.92))
    elif kind == 2:
        for frac, length in ((0.50, 0.34),):
            y = -r * frac
            for side in (-1, 1):
                segments.append((0, y, side * r * length, y - r * length * 0.85))
        # petite fourche au bout
        y = -r * 0.95
        for side in (-1, 1):
            segments.append((0, y, side * r * 0.16, y - r * 0.16))
    else:
        for frac, length in ((0.62, 0.20),):
            y = -r * frac
            for side in (-1, 1):
                segments.append((0, y, side * r * length, y - r * length))
    return segments


def flake(kind):
    out = [f'  <g transform="translate({CENTER} {CENTER})" fill="none" '
           f'stroke="#ffffff" stroke-width="{STROKE}" stroke-linecap="round">',
           f'    <circle r="{STROKE * 0.7:.2f}" fill="#ffffff" stroke="none"/>']

    for k in range(6):
        out.append(f'    <g transform="rotate({60 * k})">')
        out.append(f'      <line x1="0" y1="0" x2="0" y2="{-RADIUS:.2f}"/>')
        for x1, y1, x2, y2 in branches(kind, RADIUS):
            out.append(f'      <line x1="{x1:.2f}" y1="{y1:.2f}" '
                       f'x2="{x2:.2f}" y2="{y2:.2f}"/>')
        out.append('    </g>')

    out.append('  </g>')
    return "\n".join(out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for kind in (1, 2, 3):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" '
               f'width="{SIZE}" height="{SIZE}">\n{flake(kind)}\n</svg>\n')
        path = OUT / f"flocon-{kind}.svg"
        path.write_text(svg)
        print(f"{path.relative_to(ROOT)} — {path.stat().st_size} o")


if __name__ == "__main__":
    main()
