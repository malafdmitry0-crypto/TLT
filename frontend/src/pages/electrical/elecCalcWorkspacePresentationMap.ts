/**
 * @module electrical/workspace-presentation-map
 * @owner electrical
 * Maps orchestrated workspace pieces into presentation-assembly props.
 * Return type is inferred from the object literal so the generic assembly
 * keeps exact field types (do not annotate as Parameters<typeof assembly>).
 *
 * AF9-ELEC-CONTRACT-01: input is six consumer-owned groups instead of a flat
 * 58-field bag. Output presentation shape is unchanged.
 *
 * Core/table vs candidate/overlays mapping lives in sibling modules.
 */
import {
  mapCoreTableToPresentation,
  type WorkspacePresentationCatalog,
  type WorkspacePresentationCore,
  type WorkspacePresentationSettings,
  type WorkspacePresentationTable,
} from '@/pages/electrical/elecCalcWorkspacePresentationCoreTableMap';
import {
  mapOverlaysToPresentation,
  type WorkspacePresentationCandidate,
  type WorkspacePresentationModals,
} from '@/pages/electrical/elecCalcWorkspacePresentationOverlaysMap';

export type {
  WorkspacePresentationCatalog,
  WorkspacePresentationCore,
  WorkspacePresentationSettings,
  WorkspacePresentationTable,
} from '@/pages/electrical/elecCalcWorkspacePresentationCoreTableMap';
export type {
  WorkspacePresentationCandidate,
  WorkspacePresentationModals,
} from '@/pages/electrical/elecCalcWorkspacePresentationOverlaysMap';

/**
 * Consumer-owned groups for Electrical presentation input (AF9-ELEC-CONTRACT-01).
 */
export type WorkspacePresentationSource = {
  core: WorkspacePresentationCore;
  table: WorkspacePresentationTable;
  candidate: WorkspacePresentationCandidate;
  catalog: WorkspacePresentationCatalog;
  settings: WorkspacePresentationSettings;
  modals: WorkspacePresentationModals;
};

/** Maps orchestrated workspace pieces into presentation-assembly props. */
export function mapWorkspaceToPresentation(source: WorkspacePresentationSource) {
  return {
    ...mapCoreTableToPresentation(source),
    ...mapOverlaysToPresentation(source),
  };
}
