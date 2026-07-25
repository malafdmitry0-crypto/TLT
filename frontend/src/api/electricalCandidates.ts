/**
 * Electrical candidate + candidate-folder API calls.
 */
import apiClient, { withIdempotencyKey } from './client';
import type {
  ElectricalCandidate,
  ElectricalCandidateApplyResponse,
  ElectricalCandidateCreateRequest,
  ElectricalCandidateFolder,
  ElectricalCandidateFolderCreateRequest,
  ElectricalCandidateFolderUpdateRequest,
  ElectricalCandidateUpsertResponse,
} from '@/types/calculation';

export async function listElectricalCandidates(
  projectId: string,
  objectId: string,
  variantNumber: number,
  electricalVariantId?: string,
): Promise<ElectricalCandidate[]> {
  const { data } = await apiClient.get<ElectricalCandidate[]>('/calc/electrical/candidates', {
    params: {
      project_id: projectId,
      object_id: objectId,
      variant_number: variantNumber,
      electrical_variant_id: electricalVariantId,
    },
  });
  return data;
}

export async function createElectricalCandidate(
  payload: ElectricalCandidateCreateRequest,
): Promise<ElectricalCandidateUpsertResponse> {
  const { data } = await apiClient.post<ElectricalCandidateUpsertResponse>(
    '/calc/electrical/candidates',
    payload,
    withIdempotencyKey(),
  );
  return data;
}

export async function updateElectricalCandidate(
  candidateId: string,
  payload: Partial<Pick<
    ElectricalCandidate,
    'priority' | 'is_recommended' | 'is_pinned' | 'status' | 'engineer_comment'
  >>,
): Promise<ElectricalCandidate> {
  const { data } = await apiClient.patch<ElectricalCandidate>(
    `/calc/electrical/candidates/${candidateId}`,
    payload,
  );
  return data;
}

export async function applyElectricalCandidate(
  candidateId: string,
): Promise<ElectricalCandidateApplyResponse> {
  const { data } = await apiClient.post<ElectricalCandidateApplyResponse>(
    `/calc/electrical/candidates/${candidateId}/apply`,
    null,
    withIdempotencyKey(),
  );
  return data;
}

export async function unapplyElectricalCandidate(candidateId: string): Promise<ElectricalCandidate> {
  const { data } = await apiClient.delete<ElectricalCandidate>(
    `/calc/electrical/candidates/${candidateId}/apply`,
  );
  return data;
}

export async function listElectricalCandidateFolders(
  projectId: string,
  objectId: string,
  variantNumber: number,
  electricalVariantId?: string,
): Promise<ElectricalCandidateFolder[]> {
  const { data } = await apiClient.get<ElectricalCandidateFolder[]>(
    '/calc/electrical/candidate-folders',
    {
      params: {
        project_id: projectId,
        object_id: objectId,
        variant_number: variantNumber,
        electrical_variant_id: electricalVariantId,
      },
    },
  );
  return data;
}

export async function createElectricalCandidateFolder(
  payload: ElectricalCandidateFolderCreateRequest,
): Promise<ElectricalCandidateFolder> {
  const { data } = await apiClient.post<ElectricalCandidateFolder>(
    '/calc/electrical/candidate-folders',
    payload,
  );
  return data;
}

export async function updateElectricalCandidateFolder(
  folderId: string,
  payload: ElectricalCandidateFolderUpdateRequest,
): Promise<ElectricalCandidateFolder> {
  const { data } = await apiClient.patch<ElectricalCandidateFolder>(
    `/calc/electrical/candidate-folders/${folderId}`,
    payload,
  );
  return data;
}

export async function deleteElectricalCandidateFolder(folderId: string): Promise<void> {
  await apiClient.delete(`/calc/electrical/candidate-folders/${folderId}`);
}

export async function addElectricalCandidateToFolder(
  folderId: string,
  candidateId: string,
): Promise<ElectricalCandidateFolder> {
  const { data } = await apiClient.post<ElectricalCandidateFolder>(
    `/calc/electrical/candidate-folders/${folderId}/items`,
    { candidate_id: candidateId },
  );
  return data;
}

export async function removeElectricalCandidateFromFolder(
  folderId: string,
  candidateId: string,
): Promise<ElectricalCandidateFolder> {
  const { data } = await apiClient.delete<ElectricalCandidateFolder>(
    `/calc/electrical/candidate-folders/${folderId}/items/${candidateId}`,
  );
  return data;
}
