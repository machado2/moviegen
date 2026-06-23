import type { PranchaLayout } from '@mediagen/types';

/**
 * Geometry helper mirroring the backend montage layout (montagem.py) so the
 * Pranchas tab can render a faithful on-screen preview grid.
 *
 * Each slot is expressed in fractional canvas coordinates (0..1), so the caller
 * can multiply by whatever pixel dimensions the preview canvas uses.
 *
 * Layouts:
 *  - rows-N            : N equal-height horizontal bands, full width.
 *  - grid-CxR          : regular C-columns × R-rows grid, equal cells.
 *  - top-then-grid-2x2 : first band fills the top third; a 2×2 grid fills the
 *                        lower two thirds.
 */
export interface SlotRect {
  /** zero-based slot index, matching quadro order - 1 */
  index: number;
  /** fractional coordinates within the canvas (0..1) */
  x: number;
  y: number;
  width: number;
  height: number;
}

function rows(count: number): SlotRect[] {
  const h = 1 / count;
  const rects: SlotRect[] = [];
  for (let i = 0; i < count; i++) {
    rects.push({ index: i, x: 0, y: i * h, width: 1, height: h });
  }
  return rects;
}

function grid(cols: number, rowCount: number): SlotRect[] {
  const w = 1 / cols;
  const h = 1 / rowCount;
  const rects: SlotRect[] = [];
  let index = 0;
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({ index, x: c * w, y: r * h, width: w, height: h });
      index++;
    }
  }
  return rects;
}

function topThenGrid2x2(): SlotRect[] {
  const top: SlotRect = { index: 0, x: 0, y: 0, width: 1, height: 1 / 3 };
  const cellW = 1 / 2;
  const cellH = (2 / 3) / 2;
  const rects: SlotRect[] = [top];
  let index = 1;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      rects.push({
        index,
        x: c * cellW,
        y: 1 / 3 + r * cellH,
        width: cellW,
        height: cellH,
      });
      index++;
    }
  }
  return rects;
}

/** Returns the fractional slot rectangles for a given prancha layout. */
export function layoutSlots(layout: PranchaLayout): SlotRect[] {
  switch (layout) {
    case 'rows-1':
      return rows(1);
    case 'rows-2':
      return rows(2);
    case 'rows-3':
      return rows(3);
    case 'rows-4':
      return rows(4);
    case 'grid-2x2':
      return grid(2, 2);
    case 'grid-2x3':
      return grid(2, 3);
    case 'grid-2x4':
      return grid(2, 4);
    case 'top-then-grid-2x2':
      return topThenGrid2x2();
    default:
      return rows(1);
  }
}

export const PRANCHA_LAYOUTS: PranchaLayout[] = [
  'rows-1',
  'rows-2',
  'rows-3',
  'rows-4',
  'grid-2x2',
  'grid-2x3',
  'grid-2x4',
  'top-then-grid-2x2',
];
