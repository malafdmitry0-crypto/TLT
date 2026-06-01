import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcCandidateFolderTabs from '@/pages/electrical/ElecCalcCandidateFolderTabs';
import type { ElectricalCandidateFolder } from '@/types/calculation';

function folder(overrides: Partial<ElectricalCandidateFolder> = {}): ElectricalCandidateFolder {
  return {
    id: 'folder-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    name: 'Проектные',
    sort_order: 0,
    candidate_ids: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  } as ElectricalCandidateFolder;
}

function setup() {
  const props = {
    activeKey: 'all' as const,
    counts: {
      all: 4,
      favorite: 2,
      custom: new Map([
        ['folder-1', 3],
      ]),
    },
    folders: [folder()],
    onSelectFolder: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
  };
  return {
    props,
    user: userEvent.setup(),
    ...render(<ElecCalcCandidateFolderTabs {...props} />),
  };
}

describe('ElecCalcCandidateFolderTabs', () => {
  it('renders system and custom folders with counts', () => {
    setup();

    expect(screen.getByLabelText('Папки вариантов подбора')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Все 4/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Избранное 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Проектные 3/ })).toBeInTheDocument();
  });

  it('routes folder selection and creation callbacks', async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole('button', { name: /Избранное 2/ }));
    expect(props.onSelectFolder).toHaveBeenCalledWith('favorite');

    await user.click(screen.getByRole('button', { name: /Проектные 3/ }));
    expect(props.onSelectFolder).toHaveBeenCalledWith('custom:folder-1');

    await user.click(screen.getByRole('button', { name: /Папка/ }));
    expect(props.onCreateFolder).toHaveBeenCalledTimes(1);
  });

  it('routes custom folder menu callbacks', async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Действия с папкой Проектные' }));
    await user.click(await screen.findByText('Переименовать'));
    expect(props.onRenameFolder).toHaveBeenCalledWith(props.folders[0]);

    await user.click(screen.getByRole('button', { name: 'Действия с папкой Проектные' }));
    await user.click(await screen.findByText('Удалить'));
    expect(props.onDeleteFolder).toHaveBeenCalledWith(props.folders[0]);
  });
});
