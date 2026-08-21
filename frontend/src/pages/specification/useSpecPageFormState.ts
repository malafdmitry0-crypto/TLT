/**
 * @module specification/page-form-state
 * @owner specification
 * Transient UI + generation form state for SpecificationPage.
 */
import { useState } from 'react';
import type {
  SpecificationCandidateGroup,
  SpecificationDiagnostic,
  SpecificationGroupingMode,
  SpecificationOptions,
} from '@/api/specifications';
import type { SpecGroupBy as GroupBy } from '@/pages/specification/specFormatModel';

export function useSpecPageFormState() {
  const [groupBy, setGroupBy] = useState<GroupBy>('object_section');
  const [mergeIdentical, setMergeIdentical] = useState(false);
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
  const [draftCatalogSelections, setDraftCatalogSelections] = useState<Record<string, string>>({});
  const [catalogSelections, setCatalogSelections] = useState<Record<string, string>>({});
  const [exZone, setExZone] = useState<boolean | null>(null);
  const [reserveCoeff, setReserveCoeff] = useState('');
  // Опции индикации ТНП: К1i / К2i / Кiu / L,К2i
  const [indicationOnBoxes, setIndicationOnBoxes] = useState<boolean | null>(null);
  const [endSectionIndication, setEndSectionIndication] = useState<boolean | null>(null);
  const [topIndication, setTopIndication] = useState<boolean | null>(null);
  const [minLengthK2i, setMinLengthK2i] = useState('');
  const [groupingMode, setGroupingMode] = useState<SpecificationGroupingMode | null>(null);

  return {
    groupBy,
    setGroupBy,
    mergeIdentical,
    setMergeIdentical,
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
