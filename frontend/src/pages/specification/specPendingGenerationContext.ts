/**
 * @module specification/pending-generation-context
 * @owner specification
 * Session-scoped command state for resumable specification generation.
 */
import type {
  SpecificationGenerateVariantResult,
  SpecificationOptions,
} from '@/api/specifications';
import type { SpecificationMutationScope } from '@/pages/specification/specificationPageModelHelpers';

const STORAGE_PREFIX = 'tlt:specification:pending-generation';
const CONTEXT_VERSION = 1 as const;

type PendingGenerationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type GenerateSpecificationVariables = SpecificationMutationScope & {
  options: SpecificationOptions;
  generateVariantIds: string[];
  excludeUnassignedConfirmed: boolean;
  catalogSelections: Record<string, string>;
};

export type PendingGenerationContext = {
  version: typeof CONTEXT_VERSION;
  generateVariantIds: string[];
  options: SpecificationOptions;
  catalogSelections: Record<string, string>;
};

export type PendingGenerationContextStore = {
  load: (
    projectId: string,
    electricalVariantId: string,
  ) => PendingGenerationContext | null;
  save: (projectId: string, context: PendingGenerationContext) => void;
  clear: (projectId: string, electricalVariantIds: readonly string[]) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function finiteDecimal(value: string): number | null {
  const normalized = value.trim();
  if (
    normalized === ''
    || [...normalized].some((character) => !'0123456789+-.eE'.includes(character))
  ) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptions(value: unknown): SpecificationOptions | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set([
    'catalog_id', 'catalog_version', 'grouping_mode', 'Ex', 'K1i', 'K2i', 'Kiu',
    'L_K2i_m', 'R_gr',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  const groupingMode = value.grouping_mode;
  const minLength = value.L_K2i_m;
  const reserveCoeff = value.R_gr;
  if (
    (groupingMode !== 'separate_by_object_type' && groupingMode !== 'merge_materials')
    || typeof value.Ex !== 'boolean'
    || typeof value.K1i !== 'boolean'
    || typeof value.K2i !== 'boolean'
    || typeof value.Kiu !== 'boolean'
    || typeof minLength !== 'string'
    || finiteDecimal(minLength) == null
    || Number(minLength) < 0
    || typeof reserveCoeff !== 'string'
    || finiteDecimal(reserveCoeff) == null
  ) {
    return null;
  }

  const options: SpecificationOptions = {
    grouping_mode: groupingMode,
    Ex: value.Ex,
    K1i: value.K1i,
    K2i: value.K2i,
    Kiu: value.Kiu,
    L_K2i_m: minLength,
    R_gr: reserveCoeff,
  };
  for (const key of ['catalog_id', 'catalog_version'] as const) {
    const optionalValue = value[key];
    if (optionalValue === undefined) continue;
    if (
      optionalValue !== null
      && (typeof optionalValue !== 'string' || optionalValue.trim() === '')
    ) return null;
    options[key] = optionalValue;
  }
  return options;
}

function normalizeSelections(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const selections: Record<string, string> = {};
  for (const [groupKey, catalogItemId] of Object.entries(value)) {
    if (
      groupKey.trim() === ''
      || typeof catalogItemId !== 'string'
      || catalogItemId.trim() === ''
    ) {
      return null;
    }
    selections[groupKey] = catalogItemId;
  }
  return selections;
}

function normalizeContext(
  value: unknown,
  electricalVariantId: string,
): PendingGenerationContext | null {
  if (!isRecord(value) || value.version !== CONTEXT_VERSION) return null;
  if (Object.keys(value).some((key) => !['version', 'generateVariantIds', 'options', 'catalogSelections'].includes(key))) return null;
  if (!Array.isArray(value.generateVariantIds)) return null;
  const generateVariantIds: string[] = [];
  for (const id of value.generateVariantIds) {
    if (typeof id !== 'string' || id.trim() === '') return null;
    if (!generateVariantIds.includes(id)) generateVariantIds.push(id);
  }
  if (generateVariantIds.length === 0 || !generateVariantIds.includes(electricalVariantId)) {
    return null;
  }
  const options = normalizeOptions(value.options);
  const catalogSelections = normalizeSelections(value.catalogSelections);
  if (!options || !catalogSelections) return null;
  return {
    version: CONTEXT_VERSION,
    generateVariantIds,
    options,
    catalogSelections,
  };
}

export function pendingGenerationContextStorageKey(
  projectId: string,
  electricalVariantId: string,
): string {
  return `${STORAGE_PREFIX}:${projectId}:${electricalVariantId}`;
}

export function buildPendingGenerationContext(
  variables: GenerateSpecificationVariables,
): PendingGenerationContext {
  return {
    version: CONTEXT_VERSION,
    generateVariantIds: [...variables.generateVariantIds],
    options: { ...variables.options },
    catalogSelections: { ...variables.catalogSelections },
  };
}

export function rememberPendingGenerationContext(
  store: PendingGenerationContextStore,
  variables: GenerateSpecificationVariables,
): PendingGenerationContext {
  const context = buildPendingGenerationContext(variables);
  store.save(variables.projectId, context);
  return context;
}

export function settlePendingGenerationContext(
  store: PendingGenerationContextStore,
  variables: GenerateSpecificationVariables,
  statuses: readonly SpecificationGenerateVariantResult['status'][],
): void {
  if (statuses.some((status) => (
    status === 'selection_required' || status === 'confirmation_required'
  ))) {
    rememberPendingGenerationContext(store, variables);
    return;
  }
  store.clear(variables.projectId, variables.generateVariantIds);
}

export function hydratePendingGenerationContext(
  store: PendingGenerationContextStore,
  projectId: string | null | undefined,
  electricalVariantId: string | null | undefined,
  status: SpecificationGenerateVariantResult['status'] | null,
): PendingGenerate | null {
  if (!projectId || !electricalVariantId) return null;
  if (status === 'selection_required' || status === 'confirmation_required') {
    return asPendingGenerate(store.load(projectId, electricalVariantId));
  }
  if (status === 'generated' || status === 'blocked') {
    resetPendingGenerationContext(store, projectId, electricalVariantId);
  }
  return null;
}

export function resumePendingGenerationVariables(
  store: PendingGenerationContextStore,
  scope: SpecificationMutationScope,
  electricalVariantId: string | null | undefined,
  excludeUnassignedConfirmed: boolean,
  catalogSelections?: Record<string, string>,
): GenerateSpecificationVariables | null {
  if (!electricalVariantId) return null;
  const context = store.load(scope.projectId, electricalVariantId);
  if (!context) return null;
  const variables: GenerateSpecificationVariables = {
    ...scope,
    generateVariantIds: [...context.generateVariantIds],
    options: context.options,
    excludeUnassignedConfirmed,
    catalogSelections: { ...(catalogSelections ?? context.catalogSelections) },
  };
  rememberPendingGenerationContext(store, variables);
  return variables;
}

export function resetPendingGenerationContext(
  store: PendingGenerationContextStore,
  projectId: string | null | undefined,
  electricalVariantId: string | null | undefined,
): void {
  if (!projectId || !electricalVariantId) return;
  const context = store.load(projectId, electricalVariantId);
  store.clear(projectId, context?.generateVariantIds ?? [electricalVariantId]);
}

type PendingGenerate = {
  generateVariantIds: string[];
  options: SpecificationOptions;
};

function asPendingGenerate(context: PendingGenerationContext | null): PendingGenerate | null {
  return context ? {
    generateVariantIds: [...context.generateVariantIds],
    options: { ...context.options },
  } : null;
}

export function createPendingGenerationContextStore(
  storage: PendingGenerationStorage | null,
): PendingGenerationContextStore {
  const memory = new Map<string, string>();
  return {
    load(projectId, electricalVariantId) {
      const key = pendingGenerationContextStorageKey(projectId, electricalVariantId);
      let raw = memory.get(key) ?? null;
      if (raw == null && storage) {
        try {
          raw = storage.getItem(key);
        } catch {
          raw = null;
        }
      }
      if (raw == null) return null;
      try {
        return normalizeContext(JSON.parse(raw), electricalVariantId);
      } catch {
        return null;
      }
    },
    save(projectId, context) {
      const serialized = JSON.stringify(context);
      for (const electricalVariantId of context.generateVariantIds) {
        const key = pendingGenerationContextStorageKey(projectId, electricalVariantId);
        memory.set(key, serialized);
        try {
          storage?.setItem(key, serialized);
        } catch {
          // Same-page memory remains available when browser storage is denied.
        }
      }
    },
    clear(projectId, electricalVariantIds) {
      for (const electricalVariantId of electricalVariantIds) {
        const key = pendingGenerationContextStorageKey(projectId, electricalVariantId);
        memory.delete(key);
        try {
          storage?.removeItem(key);
        } catch {
          // Clearing the in-memory command is still fail-closed.
        }
      }
    },
  };
}

export function createBrowserPendingGenerationContextStore(): PendingGenerationContextStore {
  let storage: PendingGenerationStorage | null = null;
  try {
    storage = typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    storage = null;
  }
  return createPendingGenerationContextStore(storage);
}
