/**
 * @module specification/generation-hydrate
 * @owner specification
 * Pure hydrate of last generation status from GET /variants/{er} (SPEC-REM-05).
 * Survives F5 without re-running generate.
 */
import type {
  SpecificationCandidateGroup,
  SpecificationDiagnostic,
  SpecificationOptions,
} from '@/api/specifications';
import type { Specification } from '@/types/specification';

export type SpecGenerationHydrateStatus =
  | 'generated'
  | 'blocked'
  | 'confirmation_required'
  | 'selection_required';

export interface SpecGenerationHydrateResult {
  /** Whether the GET row carries a last-generation outcome. */
  hasOutcome: boolean;
  generationStatus: SpecGenerationHydrateStatus | null;
  generationDiagnostics: SpecificationDiagnostic[];
  candidateGroups: SpecificationCandidateGroup[];
  /** Open unassigned-confirm modal when status is confirmation_required. */
  preflightOpen: boolean;
  /**
   * Restore pending generate workflow so confirm/PUT+generate works after F5.
   * null clears mid-flight pending for generated/blocked.
   */
  pendingGenerate: {
    generateVariantIds: string[];
    options: SpecificationOptions;
  } | null;
  /** Clear draft catalog picks when rehydrating selection_required. */
  clearDraftSelections: boolean;
}

const STATUSES = new Set<SpecGenerationHydrateStatus>([
  'generated',
  'blocked',
  'confirmation_required',
  'selection_required',
]);

function asStatus(value: unknown): SpecGenerationHydrateStatus | null {
  if (typeof value !== 'string') return null;
  return STATUSES.has(value as SpecGenerationHydrateStatus)
    ? (value as SpecGenerationHydrateStatus)
    : null;
}

function asDiagnostics(value: unknown): SpecificationDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SpecificationDiagnostic => (
    typeof item === 'object'
    && item != null
    && typeof (item as SpecificationDiagnostic).code === 'string'
    && typeof (item as SpecificationDiagnostic).message === 'string'
    && typeof (item as SpecificationDiagnostic).kind === 'string'
  ));
}

function asCandidateGroups(value: unknown): SpecificationCandidateGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SpecificationCandidateGroup => (
    typeof item === 'object'
    && item != null
    && typeof (item as SpecificationCandidateGroup).group_key === 'string'
    && typeof (item as SpecificationCandidateGroup).electrical_variant_id === 'string'
    && typeof (item as SpecificationCandidateGroup).category === 'string'
    && Array.isArray((item as SpecificationCandidateGroup).candidates)
  ));
}

/**
 * Map GET specification row → UI generation workflow state.
 *
 * @param spec null = no row (never generated / no outcome)
 * @param electricalVariantId current ER UUID for pending generate restore
 * @param options current form options (already synced from settings/snapshot)
 */
export function buildSpecGenerationHydrate(
  spec: Specification | null | undefined,
  electricalVariantId: string | null | undefined,
  options: SpecificationOptions,
): SpecGenerationHydrateResult {
  if (!spec || !electricalVariantId) {
    return {
      hasOutcome: false,
      generationStatus: null,
      generationDiagnostics: [],
      candidateGroups: [],
      preflightOpen: false,
      pendingGenerate: null,
      clearDraftSelections: true,
    };
  }

  const generationStatus = asStatus(spec.generation_status);
  if (!generationStatus) {
    // Legacy row without REM-02 fields — treat as items-only hydrate.
    return {
      hasOutcome: false,
      generationStatus: null,
      generationDiagnostics: [],
      candidateGroups: [],
      preflightOpen: false,
      pendingGenerate: null,
      clearDraftSelections: false,
    };
  }

  const generationDiagnostics = asDiagnostics(spec.generation_diagnostics);
  const candidateGroups = asCandidateGroups(spec.generation_candidate_groups);

  if (generationStatus === 'selection_required') {
    return {
      hasOutcome: true,
      generationStatus,
      generationDiagnostics,
      candidateGroups,
      preflightOpen: false,
      pendingGenerate: {
        generateVariantIds: [electricalVariantId],
        options,
      },
      clearDraftSelections: true,
    };
  }

  if (generationStatus === 'confirmation_required') {
    return {
      hasOutcome: true,
      generationStatus,
      generationDiagnostics,
      candidateGroups: [],
      preflightOpen: true,
      pendingGenerate: {
        generateVariantIds: [electricalVariantId],
        options,
      },
      clearDraftSelections: true,
    };
  }

  if (generationStatus === 'blocked') {
    return {
      hasOutcome: true,
      generationStatus,
      generationDiagnostics,
      candidateGroups: [],
      preflightOpen: false,
      pendingGenerate: null,
      clearDraftSelections: true,
    };
  }

  // generated
  return {
    hasOutcome: true,
    generationStatus: 'generated',
    generationDiagnostics: [],
    candidateGroups: [],
    preflightOpen: false,
    pendingGenerate: null,
    clearDraftSelections: true,
  };
}
