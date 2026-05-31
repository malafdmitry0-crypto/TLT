export type CandidateFolderKey = 'all' | 'favorite' | `custom:${string}`;

export const candidateCustomFolderKey = (folderId: string): CandidateFolderKey => `custom:${folderId}`;

export const candidateCustomFolderId = (key: CandidateFolderKey): string | null =>
  key.startsWith('custom:') ? key.slice('custom:'.length) : null;
