// Shared rules for image-asset "variants" (the produced candidates kept per
// asset). Both the film and comics asset services use these so the tricky parts
// — legacy migration with a stable id, status transitions, clearing the
// selection on delete — live in exactly one place. These are PURE: they mutate
// the passed asset object; the caller owns loading/saving the project and the
// actual file I/O (which path layout differs per stack).

import type { AssetVariant } from '@mediagen/types';
import { nowIso } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';

/** Stable id of the variant synthesized from a legacy single `file`, so the id a
 * client sees on a read path still resolves on a later select/serve. */
const LEGACY_VARIANT_ID = 'var_legacy';

/** The subset of an image asset that carries produced candidates. Both Asset and
 * ComicsAsset are structurally assignable to this. */
export interface VariantAsset {
  file: string | null;
  status: string;
  variants?: AssetVariant[];
  selectedVariantId?: string | null;
}

/** Lazily turn a legacy single-file asset into a one-variant list. Returns
 * whether anything changed (so a write path can persist it). */
export function migrateVariants(asset: VariantAsset): boolean {
  if (!asset.variants) asset.variants = [];
  if (asset.variants.length === 0 && asset.file) {
    asset.variants.push({ id: LEGACY_VARIANT_ID, file: asset.file, createdAt: nowIso(), source: 'upload' });
    asset.selectedVariantId = LEGACY_VARIANT_ID;
    return true;
  }
  return false;
}

/** Keep `asset.file` mirroring the selected variant (back-compat for everything
 * that reads `asset.file`). */
export function syncSelectedFile(asset: VariantAsset): void {
  const v = asset.variants?.find((x) => x.id === asset.selectedVariantId);
  asset.file = v ? v.file : null;
}

/** Append a produced candidate. `autoSelect` (upload) makes it the chosen result
 * and activates a pending asset; API generation passes false. */
export function recordVariant(asset: VariantAsset, variant: AssetVariant, autoSelect: boolean): void {
  migrateVariants(asset);
  asset.variants!.push(variant);
  if (autoSelect) {
    asset.selectedVariantId = variant.id;
    if (asset.status === 'pending') asset.status = 'active';
  }
  syncSelectedFile(asset);
}

/** Choose which variant is the kept result (null clears the selection). */
export function selectVariant(asset: VariantAsset, variantId: string | null): void {
  migrateVariants(asset);
  if (variantId !== null && !asset.variants!.some((v) => v.id === variantId)) {
    throw badRequest('No such variant on this asset');
  }
  asset.selectedVariantId = variantId;
  if (variantId && asset.status === 'pending') asset.status = 'active';
  syncSelectedFile(asset);
}

/** Remove a variant from the asset and return it (so the caller can delete the
 * file). Clears the selection if it pointed at the removed variant. */
export function removeVariant(asset: VariantAsset, variantId: string): AssetVariant {
  migrateVariants(asset);
  const variant = asset.variants!.find((v) => v.id === variantId);
  if (!variant) throw notFound('Variant');
  asset.variants = asset.variants!.filter((v) => v.id !== variantId);
  if (asset.selectedVariantId === variantId) asset.selectedVariantId = null;
  syncSelectedFile(asset);
  return variant;
}

/** Every produced file of an asset (all variants + a legacy single file), for
 * cleanup when the asset is deleted. */
export function listVariantFiles(asset: VariantAsset): string[] {
  const files = new Set<string>(asset.variants?.map((v) => v.file) ?? []);
  if (asset.file) files.add(asset.file);
  return [...files];
}
