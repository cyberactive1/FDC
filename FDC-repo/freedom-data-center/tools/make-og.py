"""Generate public/og-freedom.jpg — the 1200x630 social card.

Run this only when the card needs to change:

    pip install Pillow
    python3 tools/make-og.py

The output is committed so `python3 build.py` stays dependency-free (it just
copies public/ into dist/). Colours are the Nocturne tokens from
src/_ds/.../styles.css and the type is the project's own self-hosted Inter, so
the card cannot drift from the page it advertises.
"""

import math
import pathlib
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / 'src' / 'fonts'
OUT = ROOT / 'public' / 'og-freedom.jpg'

W, H = 1200, 630

# Nocturne tokens
BG           = (22, 24, 38)      # --color-bg        #161826
GLOW_CORE    = (36, 39, 71)      # hero radial core  #242747
GLOW_MID     = (26, 28, 46)      #                   #1a1c2e
TEXT         = (243, 245, 254)   # --color-neutral-100
MUTED        = (147, 151, 171)   # --color-neutral-500
DIM          = (117, 121, 140)   # --color-neutral-600
ACCENT       = (181, 171, 252)   # --color-accent-400 #b5abfc
ACCENT_DEEP  = (145, 132, 217)   # --color-accent     #9184d9
ACCENT_EDGE  = (121, 108, 191)   # --color-accent-600 #796cbf


def font(weight, size):
    return ImageFont.truetype(str(FONTS / f'inter-{weight}.woff2'), size)


def tracked(draw, xy, text, fnt, fill, tracking=0.0):
    """Draw text with letter-spacing, which PIL has no concept of. Tracking is
    in ems, matching the CSS the page uses (.16em, .24em)."""
    x, y = xy
    extra = tracking * fnt.size
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + extra
    return x


def tracked_width(draw, text, fnt, tracking=0.0):
    extra = tracking * fnt.size
    return sum(draw.textlength(c, font=fnt) + extra for c in text) - extra


def radial_glow():
    """The hero's radial-gradient(70% 70% at 72% 52%, ...) at low resolution,
    then upscaled — far faster than per-pixel work and visually identical once
    blurred."""
    small = Image.new('RGB', (120, 63), BG)
    px = small.load()
    cx, cy = 0.72 * 120, 0.52 * 63
    rx, ry = 0.70 * 120, 0.70 * 63
    for y in range(63):
        for x in range(120):
            d = math.hypot((x - cx) / rx, (y - cy) / ry)
            if d >= 1.0:
                continue
            # two stops: core -> mid -> bg
            if d < 0.45:
                t = d / 0.45
                a, b = GLOW_CORE, GLOW_MID
            else:
                t = (d - 0.45) / 0.55
                a, b = GLOW_MID, BG
            t = t * t * (3 - 2 * t)  # smoothstep
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return small.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(8))


def decision_mesh(img):
    """A quiet echo of the hero's decision mesh: seeded, so the card is
    byte-reproducible from one run to the next."""
    rnd = random.Random(7)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    nodes = []
    for _ in range(46):
        # weighted to the right, where there is no text
        x = rnd.uniform(0.44, 1.02) * W
        y = rnd.uniform(-0.02, 1.02) * H
        nodes.append((x, y, rnd.random()))

    for i, (x1, y1, w1) in enumerate(nodes):
        for x2, y2, _ in nodes[i + 1:]:
            dist = math.hypot(x1 - x2, y1 - y2)
            if dist > 165:
                continue
            a = int(46 * (1 - dist / 165))
            d.line([(x1, y1), (x2, y2)], fill=ACCENT_EDGE + (a,), width=1)

    for x, y, w in nodes:
        r = 1.6 + w * 2.4
        hot = w > 0.78
        col = (ACCENT if hot else ACCENT_DEEP) + (150 if hot else 80,)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        if hot:
            d.ellipse([x - r * 3.6, y - r * 3.6, x + r * 3.6, y + r * 3.6],
                      fill=ACCENT + (16,))

    img.alpha_composite(layer)


def left_scrim(img):
    """Darken the left half so the type holds contrast over the mesh — the same
    job the hero's 90deg overlay does."""
    scrim = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = scrim.load()
    for x in range(W):
        t = x / W
        if t < 0.06:
            a = 252
        elif t < 0.62:
            a = int(252 * (1 - (t - 0.06) / 0.56) ** 1.25)
        else:
            a = 0
        if a:
            for y in range(H):
                px[x, y] = BG + (a,)
    img.alpha_composite(scrim)


def main():
    img = radial_glow().convert('RGBA')
    decision_mesh(img)
    left_scrim(img)
    d = ImageDraw.Draw(img)

    # accent hairline along the top edge
    d.rectangle([0, 0, W, 3], fill=ACCENT_DEEP)

    M = 76  # left margin

    # ---- wordmark ----------------------------------------------------------
    f_mark = font(600, 27)
    f_sub = font(500, 14)
    tracked(d, (M, 62), 'FREEDOM', f_mark, TEXT, 0.16)
    tracked(d, (M + 2, 98), 'DATA CENTER', f_sub, MUTED, 0.24)

    # ---- headline ----------------------------------------------------------
    # Two coloured runs, so wrapping is done on a flat word list that remembers
    # which run each word came from.
    runs = [('Where autonomous operations meet', TEXT),
            ('autonomous cyber resilience.', ACCENT)]
    words = [(w, c) for text, c in runs for w in text.split()]

    f_head = font(500, 61)
    max_w = 640
    lines, line = [], []
    for w, c in words:
        trial = line + [(w, c)]
        if d.textlength(' '.join(t[0] for t in trial), font=f_head) > max_w and line:
            lines.append(line)
            line = [(w, c)]
        else:
            line = trial
    if line:
        lines.append(line)

    # Four lines is forced: 'Where autonomous operations' cannot fit one line at
    # any legible size. Tightened leading so it reads as intentional, and the
    # accent payoff word lands alone on the last line.
    y = 190
    lh = 66
    for ln in lines:
        x = M
        for i, (w, c) in enumerate(ln):
            d.text((x, y), w, font=f_head, fill=c)
            x += d.textlength(w + (' ' if i < len(ln) - 1 else ''), font=f_head)
        y += lh

    # ---- kicker ------------------------------------------------------------
    f_kick = font(500, 15)
    tracked(d, (M, y + 26),
            'AI INFRASTRUCTURE · AUTONOMOUS OPERATIONS · CYBER RESILIENCE',
            f_kick, DIM, 0.13)

    # ---- location pill -----------------------------------------------------
    f_pill = font(500, 15)
    label = 'SUNRISE, FLORIDA'
    tw = tracked_width(d, label, f_pill, 0.14)
    px_, py = M, H - 92
    pw, ph = tw + 62, 40
    d.rounded_rectangle([px_, py, px_ + pw, py + ph], radius=ph / 2,
                        outline=ACCENT_DEEP + (110,), width=1)
    cy = py + ph / 2
    d.ellipse([px_ + 20 - 4, cy - 4, px_ + 20 + 4, cy + 4], fill=ACCENT)
    d.ellipse([px_ + 20 - 9, cy - 9, px_ + 20 + 9, cy + 9], fill=ACCENT + (40,))
    tracked(d, (px_ + 38, cy - 9), label, f_pill, MUTED, 0.14)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert('RGB').save(OUT, 'JPEG', quality=90, optimize=True, progressive=True)
    print('wrote %s  %dx%d  %.0f KB' % (OUT, W, H, OUT.stat().st_size / 1024))


if __name__ == '__main__':
    main()
