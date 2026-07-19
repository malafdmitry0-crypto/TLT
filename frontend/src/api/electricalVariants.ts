import apiClient, { withIdempotencyKey } from './client';
import type {
  ElectricalAssignmentListParams,
  ElectricalAssignmentListResponse,
  ElectricalAssignmentMutationResponse,
  ElectricalAssignmentUnassignRequest,
  ElectricalAssignmentUpdateRequest,
  ElectricalReadinessResponse,
  ElectricalVariant,
  ElectricalVariantCopyRequest,
  ElectricalVariantCreateRequest,
  ElectricalVariantDeleteResponse,
  ElectricalVariantInitializeResponse,
  ElectricalVariantRenameRequest,
} from '@/types/electricalVariant';

export const electricalVariantQueryKeys = {
  list: (projectId: string) =>
    ['project', projectId, 'electrical-variants'] as const,
  readiness: (projectId: string) =>
    ['project', projectId, 'electrical-readiness'] as const,
  detail: (projectId: string, electricalVariantId: string) =>
    ['project', projectId, 'electrical-variant', electricalVariantId] as const,
};

export const electricalAssignmentQueryKeys = {
  root: (projectId: string, electricalVariantId: string) => [
    ...electricalVariantQueryKeys.detail(projectId, electricalVariantId),
    'assignments',
  ] as const,
  list: (
    projectId: string,
    electricalVariantId: string,
    params: ElectricalAssignmentListParams = {},
  ) => [
    ...electricalAssignmentQueryKeys.root(projectId, electricalVariantId),
    params.view ?? 'all',
    params.assignment_state ?? 'all-states',
    params.page ?? 1,
    params.page_size ?? 50,
  ] as const,
};

// Short alias for consumers that use the conventional `*Keys` naming.
export const electricalVariantKeys = electricalVariantQueryKeys;

export async function listElectricalVariants(projectId: string): Promise<ElectricalVariant[]> {
  const { data } = await apiClient.get<ElectricalVariant[]>(
    `/projects/${projectId}/electrical-variants`,
  );
  return data;
}

export async function getElectricalVariantReadiness(
  projectId: string,
): Promise<ElectricalReadinessResponse> {
  const { data } = await apiClient.get<ElectricalReadinessResponse>(
    `/projects/${projectId}/electrical-readiness`,
  );
  return data;
}

export async function initializeElectricalVariants(
  projectId: string,
): Promise<ElectricalVariantInitializeResponse> {
  const { data } = await apiClient.post<ElectricalVariantInitializeResponse>(
    `/projects/${projectId}/electrical-variants/initialize`,
  );
  return data;
}

export async function createEmptyElectricalVariant(
  projectId: string,
  payload: ElectricalVariantCreateRequest = {},
  idempotencyKey?: string,
): Promise<ElectricalVariant> {
  const { data } = await apiClient.post<ElectricalVariant>(
    `/projects/${projectId}/electrical-variants`,
    payload,
    withIdempotencyKey(idempotencyKey
      ? { headers: { 'Idempotency-Key': idempotencyKey } }
      : undefined),
  );
  return data;
}

export async function copyElectricalVariant(
  projectId: string,
  electricalVariantId: string,
  payload: ElectricalVariantCopyRequest = {},
  idempotencyKey?: string,
): Promise<ElectricalVariant> {
  const { data } = await apiClient.post<ElectricalVariant>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}/copy`,
    payload,
    withIdempotencyKey(idempotencyKey
      ? { headers: { 'Idempotency-Key': idempotencyKey } }
      : undefined),
  );
  return data;
}

export async function renameElectricalVariant(
  projectId: string,
  electricalVariantId: string,
  payload: ElectricalVariantRenameRequest,
): Promise<ElectricalVariant> {
  const { data } = await apiClient.patch<ElectricalVariant>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}`,
    payload,
  );
  return data;
}

export async function activateElectricalVariant(
  projectId: string,
  electricalVariantId: string,
): Promise<ElectricalVariant> {
  const { data } = await apiClient.post<ElectricalVariant>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}/activate`,
  );
  return data;
}

export async function deleteElectricalVariant(
  projectId: string,
  electricalVariantId: string,
): Promise<ElectricalVariantDeleteResponse> {
  const { data } = await apiClient.delete<ElectricalVariantDeleteResponse>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}`,
  );
  return data;
}

export async function listElectricalVariantAssignments(
  projectId: string,
  electricalVariantId: string,
  params: ElectricalAssignmentListParams = {},
): Promise<ElectricalAssignmentListResponse> {
  const { data } = await apiClient.get<ElectricalAssignmentListResponse>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    { params },
  );
  return data;
}

export async function assignElectricalVariantObjects(
  projectId: string,
  electricalVariantId: string,
  payload: ElectricalAssignmentUpdateRequest,
): Promise<ElectricalAssignmentMutationResponse> {
  const { data } = await apiClient.patch<ElectricalAssignmentMutationResponse>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    payload,
  );
  return data;
}

export async function unassignElectricalVariantObjects(
  projectId: string,
  electricalVariantId: string,
  payload: ElectricalAssignmentUnassignRequest,
): Promise<ElectricalAssignmentMutationResponse> {
  const { data } = await apiClient.post<ElectricalAssignmentMutationResponse>(
    `/projects/${projectId}/electrical-variants/${electricalVariantId}/unassign`,
    payload,
  );
  return data;
}

export const getElectricalReadiness = getElectricalVariantReadiness;
export const createElectricalVariant = createEmptyElectricalVariant;
