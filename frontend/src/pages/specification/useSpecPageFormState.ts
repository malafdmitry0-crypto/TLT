/**
 * @module specification/page-form-state
 * @owner specification
 * Transient UI + generation form state for SpecificationPage.
 */
import { useState } from 'react';
import type { generateSpecification } from '@/api/specifications';
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
    options?: Parameters<typeof generateSpecification>[4];
  } | null>(null);
  const [exZone, setExZone] = useState(false);
  const [reserveCoeff, setReserveCoeff] = useState<number>(1);
  // Опции индикации ТНП: К1i / К2i / Кiu / L,К2i
  const [indicationOnBoxes, setIndicationOnBoxes] = useState(false);
  const [endSectionIndication, setEndSectionIndication] = useState(false);
  const [topIndication, setTopIndication] = useState(false);
  const [minLengthK2i, setMinLengthK2i] = useState<number>(0);
  /** PDL-ER-44: PDF §7.10 sections per connector kit (1→КСН-1, 2→КСН-2). */
  const [connectorKitSectionsPerKit, setConnectorKitSectionsPerKit] = useState<1 | 2>(1);

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
    connectorKitSectionsPerKit,
    setConnectorKitSectionsPerKit,
  };
}
