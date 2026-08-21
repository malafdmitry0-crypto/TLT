/**
 * Public electrical candidate table column settings API + compatibility re-exports.
 */
export type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateColumnMeta,
  ElectricalCandidateColumnLayout,
  ElectricalCandidateTableColumnSettings,
  ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumnsCore';

export {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_CATALOG,
  getAvailableElectricalCandidateTableColumnKeys,
  getDefaultElectricalCandidateTableColumnSettings,
  normalizeElectricalCandidateTableColumnSettings,
  getAllElectricalCandidateTableColumnMetas,
  getVisibleElectricalCandidateTableColumnMetas,
  resetElectricalCandidateTableColumnSettings,
  setElectricalCandidateTableColumnVisibility,
  setElectricalCandidateTableColumnWidthPct,
  resetElectricalCandidateTableColumnWidth,
  moveElectricalCandidateTableColumnToOrder,
  reorderElectricalCandidateTableColumn,
  createElectricalCandidateTableColumnSettingsPatch,
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  electricalTableColumnWidthPctToPx,
} from '@/utils/electricalCandidateTableColumnsCore';

export {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
  ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY,
  ELECTRICAL_REGISTERED_CANDIDATE_TABLE_COLUMN_CACHE_KEY,
  readGuestElectricalCandidateTableColumnSettings,
  writeGuestElectricalCandidateTableColumnSettings,
  readRegisteredElectricalCandidateTableColumnCache,
  writeRegisteredElectricalCandidateTableColumnCache,
  clearRegisteredElectricalCandidateTableColumnCache,
} from '@/utils/electricalCandidateTableColumnStorage';
