import type { ElectricalQueryRequest } from '@/types/calculation';

/**
 * UUID-scoped cache identities for the electrical workspace.
 *
 * `legacy_variant_number` is deliberately absent from every key: a numeric
 * compatibility slot may be reused by another electrical variant after a
 * delete/create cycle, while the UUID is the stable product identity.
 */
export const electricalDataQueryKeys = {
  variant: (projectId: string, electricalVariantId: string) => [
    'project',
    projectId,
    'electrical-variant',
    electricalVariantId,
  ] as const,
  capabilities: (projectId: string, electricalVariantId: string) => [
    ...electricalDataQueryKeys.variant(projectId, electricalVariantId),
    'query-capabilities',
  ] as const,
  queries: (projectId: string, electricalVariantId: string) => [
    ...electricalDataQueryKeys.variant(projectId, electricalVariantId),
    'query',
  ] as const,
  page: (
    projectId: string,
    electricalVariantId: string,
    request: ElectricalQueryRequest | null,
  ) => [
    ...electricalDataQueryKeys.queries(projectId, electricalVariantId),
    request,
  ] as const,
  candidates: (
    projectId: string,
    electricalVariantId: string,
    objectId: string | null,
  ) => [
    ...electricalDataQueryKeys.variant(projectId, electricalVariantId),
    'candidates',
    objectId,
  ] as const,
  candidateFolders: (
    projectId: string,
    electricalVariantId: string,
    objectId: string | null,
  ) => [
    ...electricalDataQueryKeys.variant(projectId, electricalVariantId),
    'candidate-folders',
    objectId,
  ] as const,
};
