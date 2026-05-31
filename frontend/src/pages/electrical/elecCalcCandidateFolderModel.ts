import type { ElectricalCandidate, ElectricalCandidateFolder } from '@/types/calculation';

export type CandidateFolderKey = 'all' | 'favorite' | `custom:${string}`;
export type CandidateFolderCounts = {
  all: number;
  favorite: number;
  custom: Map<string, number>;
};

export const candidateCustomFolderKey = (folderId: string): CandidateFolderKey => `custom:${folderId}`;

export const candidateCustomFolderId = (key: CandidateFolderKey): string | null =>
  key.startsWith('custom:') ? key.slice('custom:'.length) : null;

export function findActiveCustomCandidateFolder(
  key: CandidateFolderKey,
  folders: readonly ElectricalCandidateFolder[],
): ElectricalCandidateFolder | null {
  const folderId = candidateCustomFolderId(key);
  if (!folderId) return null;
  return folders.find((folder) => folder.id === folderId) ?? null;
}

export function filterCandidatesByActiveFolder(
  candidates: readonly ElectricalCandidate[],
  key: CandidateFolderKey,
  activeCustomFolder: ElectricalCandidateFolder | null,
): readonly ElectricalCandidate[] {
  if (key === 'favorite') {
    return candidates.filter((candidate) => candidate.is_pinned);
  }
  if (activeCustomFolder) {
    const ids = new Set(activeCustomFolder.candidate_ids);
    return candidates.filter((candidate) => ids.has(candidate.id));
  }
  return candidates;
}

export function buildCandidateFolderCounts(
  candidates: readonly ElectricalCandidate[],
  folders: readonly ElectricalCandidateFolder[],
): CandidateFolderCounts {
  const allIds = new Set(candidates.map((candidate) => candidate.id));
  return {
    all: candidates.length,
    favorite: candidates.filter((candidate) => candidate.is_pinned).length,
    custom: new Map(
      folders.map((folder) => [
        folder.id,
        folder.candidate_ids.filter((candidateId) => allIds.has(candidateId)).length,
      ]),
    ),
  };
}
