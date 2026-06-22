#!/usr/bin/env python3
"""Deterministic page (prancha) montage for ComicsGen.

Invoked as a child process:  python3 montagem.py <spec.json>

The spec JSON describes the canvas, gutter, background, fit algorithm, the
layout template, and the ordered list of selected render file paths. Each render
is placed into its layout slot; the layout determines slot positions and
proportions. No lettering is done here — texts are baked into the renders.

spec.json schema:
{
  "layout": "grid-2x2",
  "canvasWidth": 1800,
  "canvasHeight": 2700,
  "gutterPx": 48,
  "background": "black",
  "fit": "contain",          # or "cover"
  "renders": ["/abs/a.png", "/abs/b.png", ...],   # ordered by quadro.order
  "output": "/abs/output/pranchas/<id>.png"
}
"""
import json
import sys

from PIL import Image


def slot_rects(layout, W, H, g):
    """Return a list of (x, y, w, h) slot rectangles for the layout.

    A uniform gutter `g` is applied both between panels and as the outer margin.
    """
    rects = []

    def rows(n):
        row_h = (H - (n + 1) * g) / n
        inner_w = W - 2 * g
        for i in range(n):
            y = g + i * (row_h + g)
            rects.append((g, y, inner_w, row_h))

    def grid(cols, r):
        cell_w = (W - (cols + 1) * g) / cols
        cell_h = (H - (r + 1) * g) / r
        for row in range(r):
            for col in range(cols):
                x = g + col * (cell_w + g)
                y = g + row * (cell_h + g)
                rects.append((x, y, cell_w, cell_h))

    if layout == "rows-1":
        rows(1)
    elif layout == "rows-2":
        rows(2)
    elif layout == "rows-3":
        rows(3)
    elif layout == "rows-4":
        rows(4)
    elif layout == "grid-2x2":
        grid(2, 2)
    elif layout == "grid-2x3":
        grid(2, 3)
    elif layout == "grid-2x4":
        grid(2, 4)
    elif layout == "top-then-grid-2x2":
        # Top band occupies the upper third; a 2x2 grid the lower two thirds.
        usable = H - 3 * g
        top_h = usable / 3.0
        rects.append((g, g, W - 2 * g, top_h))
        grid_y0 = g + top_h + g
        grid_region_h = usable - top_h
        cell_w = (W - 3 * g) / 2.0
        cell_h = (grid_region_h - g) / 2.0
        for row in range(2):
            for col in range(2):
                x = g + col * (cell_w + g)
                y = grid_y0 + row * (cell_h + g)
                rects.append((x, y, cell_w, cell_h))
    else:
        raise ValueError("unknown layout: %s" % layout)

    return [(int(round(x)), int(round(y)), int(round(w)), int(round(h))) for (x, y, w, h) in rects]


def fit_image(img, w, h, mode):
    """Resize `img` into a (w, h) box using contain or cover."""
    iw, ih = img.size
    if iw == 0 or ih == 0:
        return Image.new("RGB", (w, h), (0, 0, 0)), (0, 0)
    scale_contain = min(w / iw, h / ih)
    scale_cover = max(w / iw, h / ih)
    scale = scale_contain if mode == "contain" else scale_cover
    nw, nh = max(1, int(round(iw * scale))), max(1, int(round(ih * scale)))
    resized = img.convert("RGB").resize((nw, nh), Image.LANCZOS)
    if mode == "cover":
        # Center-crop to the slot.
        left = (nw - w) // 2
        top = (nh - h) // 2
        resized = resized.crop((left, top, left + w, top + h))
        return resized, (0, 0)
    # contain: center within the slot, gutter color shows around.
    offset = ((w - nw) // 2, (h - nh) // 2)
    return resized, offset


def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    W = int(spec["canvasWidth"])
    H = int(spec["canvasHeight"])
    g = int(spec["gutterPx"])
    fit = spec.get("fit", "contain")
    background = spec.get("background", "black")
    renders = spec["renders"]

    rects = slot_rects(spec["layout"], W, H, g)
    if len(renders) != len(rects):
        raise ValueError(
            "render count %d does not match layout slot count %d" % (len(renders), len(rects))
        )

    canvas = Image.new("RGB", (W, H), background)
    for path, (x, y, w, h) in zip(renders, rects):
        with Image.open(path) as img:
            placed, (ox, oy) = fit_image(img, w, h, fit)
        canvas.paste(placed, (x + ox, y + oy))

    canvas.save(spec["output"], "PNG")
    print(json.dumps({"ok": True, "output": spec["output"], "slots": len(rects)}))


if __name__ == "__main__":
    main()
