import type { ReactNode } from 'react';

import type { ElectricalCalcSummary, ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCandidateTableColumnSettings } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalTableColumnSettings } from '@/utils/electricalTableColumns';
import type { ElectricalTableViewSettings } from '@/utils/electricalTableViewSettings';

export const ELECTRICAL_TABLE_PAGE_SIZE = 50;
export const SHOW_COMMERCIAL_CABLE_BASE_UI = false;
export const EMPTY_OBJECTS: ProjectObject[] = [];
export const EMPTY_ELECTRICAL_CALCS: ElectricalCalcSummary[] = [];

export type CandidateFolderModalMode = 'create' | 'rename';

export type ElectricalBatchScope = 'all' | 'selected';

export type ElectricalBatchMutationArgs = {
  scope: ElectricalBatchScope;
  objectIds?: string[];
  skipManual?: boolean;
  /** Override default recalculation cable type for this job. */
  cableType?: import('@/pages/electrical/elecCalcMainTableModel').CableTypeKey;
  objectOverrides?: Array<{
    object_id: string;
    cable_type?: import('@/pages/electrical/elecCalcMainTableModel').CableTypeKey | null;
  }>;
};

export type CopyElectricalVariantMutationArgs = {
  targetVariant: number;
  overwrite?: boolean;
};

export type ElectricalNavigationState = {
  activeJobId?: string;
} | null;

export type ElectricalTableColumnPreferenceMutation = {
  settings: ElectricalTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};

export type ElectricalCandidateTableColumnPreferenceMutation = {
  settings: ElectricalCandidateTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};

export type ElectricalTableSettingsPreferenceMutation = {
  columnSettings: ElectricalTableColumnSettings;
  viewSettings: ElectricalTableViewSettings;
};

export type ElectricalColumnRenderSpec = {
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  render: (_: unknown, obj: ProjectObject, idx: number) => ReactNode;
};

export type ElectricalLoadedPagesArgs = {
  electricalGlideEnabled: boolean;
  electricalPage?: ElectricalQueryResponse;
  electricalInfinitePages: Record<number, ElectricalQueryResponse>;
  isElectricalPagePlaceholderData: boolean;
  tablePage: number;
};

export function electricalLoadedPagesForTable({
  electricalGlideEnabled,
  electricalPage,
  electricalInfinitePages,
  isElectricalPagePlaceholderData,
  tablePage,
}: ElectricalLoadedPagesArgs): ElectricalQueryResponse[] {
  if (!electricalGlideEnabled) {
    return electricalPage ? [electricalPage] : [];
  }
  const pages: ElectricalQueryResponse[] = [];
  for (let page = 1; page <= tablePage; page += 1) {
    const loadedPage = electricalInfinitePages[page];
    if (loadedPage) pages.push(loadedPage);
  }
  if (pages.length === 0 && electricalPage && !isElectricalPagePlaceholderData) {
    return [electricalPage];
  }
  return pages;
}

export function electricalObjectsForTable(
  electricalGlideEnabled: boolean,
  electricalPage: ElectricalQueryResponse | undefined,
  electricalLoadedPages: ElectricalQueryResponse[],
): ProjectObject[] {
  if (!electricalGlideEnabled) return electricalPage?.items ?? EMPTY_OBJECTS;
  if (electricalLoadedPages.length === 0) return EMPTY_OBJECTS;
  const seen = new Set<string>();
  const rows: ProjectObject[] = [];
  electricalLoadedPages.forEach((page) => {
    page.items.forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      rows.push(item);
    });
  });
  return rows;
}

export function electricalCalculationsForTable(
  electricalGlideEnabled: boolean,
  electricalPage: ElectricalQueryResponse | undefined,
  electricalLoadedPages: ElectricalQueryResponse[],
): ElectricalCalcSummary[] {
  if (!electricalGlideEnabled) return electricalPage?.calculations ?? EMPTY_ELECTRICAL_CALCS;
  if (electricalLoadedPages.length === 0) return EMPTY_ELECTRICAL_CALCS;
  const seen = new Set<string>();
  const calculations: ElectricalCalcSummary[] = [];
  electricalLoadedPages.forEach((page) => {
    page.calculations.forEach((calc) => {
      if (seen.has(calc.object_id)) return;
      seen.add(calc.object_id);
      calculations.push(calc);
    });
  });
  return calculations;
}
