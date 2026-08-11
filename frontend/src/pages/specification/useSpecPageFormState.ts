/**
 * @module specification/page-form-state
 * @owner specification
 * Transient UI + generation form state for SpecificationPage.
 */
import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  type SpecificationCandidateGroup,
  type SpecificationDiagnostic,
  type SpecificationGroupingMode,
  type SpecificationOptions,
} from '@/api/specifications';
import { DEFAULT_SPECIFICATION_GROUPING_MODE } from '@/pages/specification/specGenerationOptionsSyncModel';

export function useSpecPageFormState() {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  // PDL-ER-29: canonical product mode is always full data-driven BOM.
  // Manual item CRUD remains employee/admin only (PDL-ER-04).
  // PDL-ER-01: explicit multi-ЭР selection for generation; never implicit all-on-open.
  const [selectedGenerateErIds, setSelectedGenerateErIds] = useState<string[]>([]);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightSummary, setPreflightSummary] = useState<string>('');
  const [pendingGenerate, setPendingGenerate] = useState<{
    generateVariantIds: string[];
    options: SpecificationOptions;
  } | null>(null);
  const [generationDiagnostics, setGenerationDiagnostics] = useState<SpecificationDiagnostic[]>([]);
  const [candidateGroups, setCandidateGroups] = useState<SpecificationCandidateGroup[]>([]);
  /** Draft UI picks only; never preselected from first candidate. */
  const [draftCatalogSelections, setDraftCatalogSelectionsState] = useState<Record<string, string>>({});
  const draftCatalogSelectionsRef = useRef<Record<string, string>>({});
  const setDraftCatalogSelections: Dispatch<SetStateAction<Record<string, string>>> = useCallback(
    (next) => {
      const value = typeof next === 'function'
        ? next(draftCatalogSelectionsRef.current)
        : next;
      draftCatalogSelectionsRef.current = value;
      setDraftCatalogSelectionsState(value);
    },
    [],
  );
  const getDraftCatalogSelections = useCallback(
    () => draftCatalogSelectionsRef.current,
    [],
  );
  const [catalogSelections, setCatalogSelections] = useState<Record<string, string>>({});
  const [exZone, setExZone] = useState(false);
  const [reserveCoeff, setReserveCoeff] = useState('');
  // Опции индикации ТНП: К1i / К2i / Кiu / L,К2i
  const [indicationOnBoxes, setIndicationOnBoxes] = useState(false);
  const [endSectionIndication, setEndSectionIndication] = useState(false);
  const [topIndication, setTopIndication] = useState(false);
  const [minLengthK2i, setMinLengthK2i] = useState('');
  const [groupingMode, setGroupingMode] = useState<SpecificationGroupingMode>(
    DEFAULT_SPECIFICATION_GROUPING_MODE,
  );

  return {
    addOpen,
    setAddOpen,
    selectedAccessoryId,
    setSelectedAccessoryId,
    qty,
    setQty,
    selectedGenerateErIds,
    setSelectedGenerateErIds,
    preflightOpen,
    setPreflightOpen,
    preflightSummary,
    setPreflightSummary,
    pendingGenerate,
    setPendingGenerate,
    generationDiagnostics,
    setGenerationDiagnostics,
    candidateGroups,
    setCandidateGroups,
    draftCatalogSelections,
    setDraftCatalogSelections,
    getDraftCatalogSelections,
    catalogSelections,
    setCatalogSelections,
    exZone,
    setExZone,
    reserveCoeff,
    setReserveCoeff,
    indicationOnBoxes,
    setIndicationOnBoxes,
    endSectionIndication,
    setEndSectionIndication,
    topIndication,
    setTopIndication,
    minLengthK2i,
    setMinLengthK2i,
    groupingMode,
    setGroupingMode,
  };
}
