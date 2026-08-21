/**
 * Persist explicit multi-candidate choices before generation.
 * Server-side selections are the durable source; client draft state is transient.
 */
import {
  candidateGroupNeedsUserChoice,
  getCatalogSelections,
  putCatalogSelections,
  type SpecificationCandidateGroup,
  type SpecificationCatalogSelectionEntry,
} from '@/api/specifications';

export type CatalogSelectionPersistenceResult =
  | 'saved'
  | 'invalid_fingerprint'
  | 'no_selection';

export async function persistSpecificationCatalogSelections(args: {
  projectId: string;
  groups: SpecificationCandidateGroup[];
  draftSelections: Record<string, string>;
}): Promise<CatalogSelectionPersistenceResult> {
  const byEr = new Map<string, SpecificationCatalogSelectionEntry[]>();

  for (const group of args.groups) {
    if (!candidateGroupNeedsUserChoice(group)) continue;
    const itemId = args.draftSelections[group.group_key];
    if (!itemId) continue;
    const candidate = group.candidates.find((item) => item.catalog_item_id === itemId);
    if (!candidate) continue;
    const fingerprint = group.candidate_set_fingerprint;
    if (!fingerprint || !fingerprint.startsWith('sha256:')) {
      return 'invalid_fingerprint';
    }
    const entry: SpecificationCatalogSelectionEntry = {
      candidate_group_key: group.group_key,
      catalog_version_id: candidate.catalog_id,
      catalog_item_id: itemId,
      candidate_set_fingerprint: fingerprint,
    };
    const list = byEr.get(group.electrical_variant_id) ?? [];
    list.push(entry);
    byEr.set(group.electrical_variant_id, list);
  }

  if (byEr.size === 0) return 'no_selection';

  for (const [electricalVariantId, selections] of byEr) {
    const current = await getCatalogSelections(args.projectId, electricalVariantId);
    await putCatalogSelections(args.projectId, electricalVariantId, {
      expected_version: current.collection_version,
      selections,
    });
  }
  return 'saved';
}
