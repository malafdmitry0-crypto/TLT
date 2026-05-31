import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCandidateTableColumnSettings } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalTableColumnSettings } from '@/utils/electricalTableColumns';
import type { ElectricalTableViewSettings } from '@/utils/electricalTableViewSettings';

export const ELECTRICAL_TABLE_PAGE_SIZE = 50;
export const EMPTY_OBJECTS: ProjectObject[] = [];
export const EMPTY_ELECTRICAL_CALCS: ElectricalCalcSummary[] = [];

export type CandidateFolderModalMode = 'create' | 'rename';

export type ElectricalBatchScope = 'all' | 'selected';

export type ElectricalBatchMutationArgs = {
  scope: ElectricalBatchScope;
  objectIds?: string[];
  skipManual?: boolean;
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
