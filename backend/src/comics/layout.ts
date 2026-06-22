import type { PranchaLayout, QuadroSlotFormat } from '@moviegen/types';
import { QUADRO_COUNT_BY_LAYOUT } from '@moviegen/types';

export function quadroCount(layout: PranchaLayout): number {
  return QUADRO_COUNT_BY_LAYOUT[layout];
}

/**
 * The slot format is determined automatically by the prancha layout and the
 * quadro position (0-based). The user never picks it manually.
 */
export function slotFormatFor(layout: PranchaLayout, index: number): QuadroSlotFormat {
  switch (layout) {
    case 'rows-1':
      return 'vertical de página inteira, proporção 2:3';
    case 'rows-2':
      return 'horizontal alto, proporção 4:3';
    case 'rows-3':
      return 'horizontal panorâmico, proporção 2:1';
    case 'rows-4':
      return 'horizontal muito panorâmico, proporção 3:1';
    case 'grid-2x2':
      return 'vertical, proporção 2:3';
    case 'grid-2x3':
    case 'grid-2x4':
      return 'quadrado, proporção 1:1';
    case 'top-then-grid-2x2':
      return index === 0 ? 'horizontal panorâmico, proporção 2:1' : 'quadrado, proporção 1:1';
  }
}

export const LAYOUTS: PranchaLayout[] = [
  'rows-1', 'rows-2', 'rows-3', 'rows-4',
  'grid-2x2', 'grid-2x3', 'grid-2x4', 'top-then-grid-2x2',
];

export function isLayout(value: unknown): value is PranchaLayout {
  return typeof value === 'string' && (LAYOUTS as string[]).includes(value);
}
