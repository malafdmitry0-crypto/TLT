import { describe, expect, it } from 'vitest';

import { candidateFolderEmptyText } from '@/pages/electrical/useElecCalcWorkspaceUiHelpers';

describe('candidateFolderEmptyText', () => {
  it('covers favorite, custom and default', () => {
    expect(candidateFolderEmptyText('favorite', false)).toContain('избранном');
    expect(candidateFolderEmptyText('custom:1', true)).toContain('этой папке');
    expect(candidateFolderEmptyText('all', false)).toContain('Вариантов пока нет');
  });
});
