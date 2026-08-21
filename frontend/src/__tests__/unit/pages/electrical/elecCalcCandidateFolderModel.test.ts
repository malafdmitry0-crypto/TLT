// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildCandidateFolderCounts,
  candidateCustomFolderId,
  candidateCustomFolderKey,
  filterCandidatesByActiveFolder,
  findActiveCustomCandidateFolder,
} from '@/pages/electrical/elecCalcCandidateFolderModel';
import type { ElectricalCandidate, ElectricalCandidateFolder } from '@/types/calculation';

function candidate(id: string, isPinned = false): ElectricalCandidate {
  return {
    id,
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'selfreg',
    cable_source: 'builtin',
    cable_mark: null,
    dedupe_key: id,
    mode: 'auto',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: isPinned,
    is_applied: false,
    params: {},
    results: null,
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  };
}

function folder(id: string, candidateIds: string[]): ElectricalCandidateFolder {
  return {
    id,
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    name: id,
    sort_order: 0,
    candidate_ids: candidateIds,
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  };
}

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

  it('finds active custom folders only for existing custom keys', () => {
    const folders = [folder('folder-1', ['candidate-1']), folder('folder-2', [])];

    expect(findActiveCustomCandidateFolder('all', folders)).toBeNull();
    expect(findActiveCustomCandidateFolder('favorite', folders)).toBeNull();
    expect(findActiveCustomCandidateFolder('custom:missing', folders)).toBeNull();
    expect(findActiveCustomCandidateFolder('custom:folder-2', folders)).toBe(folders[1]);
  });

  it('filters candidates by all, favorite and active custom folder', () => {
    const candidates = [
      candidate('candidate-1', true),
      candidate('candidate-2'),
      candidate('candidate-3', true),
    ];
    const activeFolder = folder('folder-1', ['candidate-2', 'missing']);

    expect(filterCandidatesByActiveFolder(candidates, 'all', null)).toBe(candidates);
    expect(filterCandidatesByActiveFolder(candidates, 'favorite', null).map((item) => item.id))
      .toEqual(['candidate-1', 'candidate-3']);
    expect(filterCandidatesByActiveFolder(candidates, 'custom:folder-1', activeFolder).map((item) => item.id))
      .toEqual(['candidate-2']);
  });

  it('counts all, favorite and custom folder candidates ignoring missing ids', () => {
    const candidates = [
      candidate('candidate-1', true),
      candidate('candidate-2'),
      candidate('candidate-3', true),
    ];
    const counts = buildCandidateFolderCounts(candidates, [
      folder('folder-1', ['candidate-1', 'candidate-2', 'missing']),
      folder('folder-2', ['missing']),
    ]);

    expect(counts.all).toBe(3);
    expect(counts.favorite).toBe(2);
    expect([...counts.custom.entries()]).toEqual([
      ['folder-1', 2],
      ['folder-2', 0],
    ]);
  });
});
