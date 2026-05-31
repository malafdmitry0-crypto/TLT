import { describe, expect, it } from 'vitest';

import {
  candidateCustomFolderId,
  candidateCustomFolderKey,
} from '@/pages/electrical/elecCalcCandidateFolderModel';

describe('elecCalcCandidateFolderModel', () => {
  it('keeps custom folder keys encoded with the existing prefix', () => {
    expect(candidateCustomFolderKey('folder-1')).toBe('custom:folder-1');
    expect(candidateCustomFolderKey('')).toBe('custom:');
  });

  it('extracts only custom folder ids from candidate folder keys', () => {
    expect(candidateCustomFolderId('all')).toBeNull();
    expect(candidateCustomFolderId('favorite')).toBeNull();
    expect(candidateCustomFolderId('custom:folder-1')).toBe('folder-1');
    expect(candidateCustomFolderId('custom:')).toBe('');
  });
});
