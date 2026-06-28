#!/usr/bin/env python3
"""Deterministic page (prancha) montage for ComicsGen.

Invoked as a child process:  python3 montagem.py <spec.json>

The spec JSON describes the canvas, gutter, background, fit algorithm, the
layout template, and the ordered list of selected render file paths. Each render
is placed into its layout slot; the layout determines slot positions and
proportions. Optional lettering data draws simple balloons/captions on top.

spec.json schema:
{
  "layout": "grid-2x2",
  "canvasWidth": 1800,
  "canvasHeight": 2700,
  "gutterPx": 48,
  "background": "black",
  "fit": "contain",          # or "cover"
  "renders": ["/abs/a.png", "/abs/b.png", "..."],   # ordered by quadro.order
  "lettering": [{"order": 1, "texts": [{"type": "dialogue", "text": "Olá"}]}],
  "output": "/abs/output/pranchas/<id>.png"
}
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont


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


def load_font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            pass
    return ImageFont.load_default()


def text_size(draw, text, font):
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw, text, font, max_w):
    words = str(text).split()
    if not words:
        return [""]
    lines = []
    cur = words[0]
    for word in words[1:]:
        trial = cur + " " + word
        if text_size(draw, trial, font)[0] <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return lines


def draw_text_box(draw, rect, text, font, fill, outline, text_fill, radius=18, pad=14):
    x, y, w, h = rect
    max_text_w = max(10, w - 2 * pad)
    lines = wrap_text(draw, text, font, max_text_w)
    line_h = max(text_size(draw, "Ag", font)[1], 1) + 6
    box_h = min(h, max(line_h + 2 * pad, len(lines) * line_h + 2 * pad))
    draw.rounded_rectangle((x, y, x + w, y + box_h), radius=radius, fill=fill, outline=outline, width=3)
    ty = y + pad
    for line in lines:
        draw.text((x + pad, ty), line, font=font, fill=text_fill)
        ty += line_h
        if ty > y + box_h - pad:
            break
    return box_h


def draw_lettering(canvas, rects, lettering):
    if not lettering:
        return
    draw = ImageDraw.Draw(canvas)
    by_order = {int(item.get("order", i + 1)): item.get("texts", []) for i, item in enumerate(lettering)}
    base_font = load_font(max(24, canvas.size[0] // 58))
    small_font = load_font(max(21, canvas.size[0] // 68))
    sfx_font = load_font(max(42, canvas.size[0] // 34), bold=True)

    for idx, (x, y, w, h) in enumerate(rects, start=1):
        texts = [t for t in by_order.get(idx, []) if str(t.get("text", "")).strip()]
        if not texts:
            continue
        margin = max(10, min(w, h) // 24)
        bubble_w = int(w * 0.58)
        cursor_y = y + margin
        side_toggle = 0
        for t in texts:
            kind = t.get("type", "caption")
            value = str(t.get("text", "")).strip()
            if not value:
                continue
            if kind == "sfx":
                tw, th = text_size(draw, value, sfx_font)
                tx = x + max(margin, (w - tw) // 2)
                ty = y + max(margin, int(h * 0.55) - th // 2)
                draw.text((tx + 3, ty + 3), value, font=sfx_font, fill=(0, 0, 0))
                draw.text((tx, ty), value, font=sfx_font, fill=(255, 245, 95))
            elif kind in ("caption", "sign", "title"):
                box_w = int(w * 0.78)
                used = draw_text_box(
                    draw,
                    (x + margin, cursor_y, box_w, int(h * 0.28)),
                    value,
                    small_font,
                    fill=(255, 246, 196),
                    outline=(20, 20, 20),
                    text_fill=(0, 0, 0),
                    radius=4,
                    pad=12,
                )
                cursor_y += used + margin
            else:
                box_x = x + margin if side_toggle % 2 == 0 else x + w - bubble_w - margin
                side_toggle += 1
                used = draw_text_box(
                    draw,
                    (box_x, cursor_y, bubble_w, int(h * 0.34)),
                    value,
                    base_font,
                    fill=(255, 255, 255),
                    outline=(10, 10, 10),
                    text_fill=(0, 0, 0),
                    radius=24,
                    pad=14,
                )
                cursor_y += used + margin


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
    draw_lettering(canvas, rects, spec.get("lettering"))

    canvas.save(spec["output"], "PNG")
    print(json.dumps({"ok": True, "output": spec["output"], "slots": len(rects)}))


if __name__ == "__main__":
    main()
