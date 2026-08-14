/**
 * @module specification/generation-outcome
 * @owner specification
 * Pure routing of a multi-ER generation response into mutually exclusive UI stages.
 */
import type {
  SpecificationCandidateGroup,
  SpecificationDiagnostic,
  SpecificationGenerateVariantResult,
} from '@/api/specifications';
import { deduplicateSpecificationDiagnostics } from '@/pages/specification/specificationReadinessModel';

export type SpecificationGenerationUiState =
  | 'selection'
  | 'confirmation'
  | 'blocked'
  | 'generated';

export interface SpecificationGenerationOutcome {
  state: SpecificationGenerationUiState;
  candidateGroups: SpecificationCandidateGroup[];
  confirmationDiagnostics: SpecificationDiagnostic[];
  blockingDiagnostics: SpecificationDiagnostic[];
  generatedVariantIds: string[];
  generatedCount: number;
  hasUnresolved: boolean;
  pendingTransition: 'retain' | 'clear';
  openSelection: boolean;
  openConfirmation: boolean;
  closeSettings: boolean;
  clearDraftSelections: boolean;
  clearCatalogSelections: boolean;
}

export function selectSpecificationGenerationOutcome(
  results: readonly SpecificationGenerateVariantResult[],
): SpecificationGenerationOutcome {
  const selectionResults = results.filter((result) => result.status === 'selection_required');
  const confirmationResults = results.filter((result) => result.status === 'confirmation_required');
  const blockedResults = results.filter((result) => result.status === 'blocked');
  const generatedResults = results.filter((result) => result.status === 'generated');
  const state: SpecificationGenerationUiState = selectionResults.length > 0
    ? 'selection'
    : confirmationResults.length > 0
      ? 'confirmation'
      : blockedResults.length > 0
        ? 'blocked'
        : 'generated';
  const pendingTransition = state === 'selection' || state === 'confirmation'
    ? 'retain'
    : 'clear';

  return {
    state,
    candidateGroups: selectionResults.flatMap((result) => result.candidate_groups ?? []),
    confirmationDiagnostics: deduplicateSpecificationDiagnostics(
      confirmationResults
        .flatMap((result) => result.diagnostics)
        .filter((diagnostic) => diagnostic.kind === 'confirmable'),
    ),
    blockingDiagnostics: deduplicateSpecificationDiagnostics(
      blockedResults
        .flatMap((result) => result.diagnostics)
        .filter((diagnostic) => diagnostic.kind === 'blocking'),
    ),
    generatedVariantIds: [...new Set(
      generatedResults.map((result) => result.electrical_variant_id),
    )],
    generatedCount: generatedResults.length,
    hasUnresolved: generatedResults.length !== results.length,
    pendingTransition,
    openSelection: state === 'selection',
    openConfirmation: state === 'confirmation',
    closeSettings: state === 'generated',
    clearDraftSelections: state === 'selection' || pendingTransition === 'clear',
    clearCatalogSelections: pendingTransition === 'clear',
  };
}
