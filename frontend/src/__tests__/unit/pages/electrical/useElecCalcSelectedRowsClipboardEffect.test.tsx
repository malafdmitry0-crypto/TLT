import { act, renderHook, waitFor } from '@testing-library/react';
import { appMessage as message } from '@/feedback/appFeedback';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectObject } from '@/types/project';
import { copyToClipboard } from '@/utils/clipboard';
import { useElecCalcSelectedRowsClipboardEffect } from '@/pages/electrical/useElecCalcSelectedRowsClipboardEffect';

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: {

    success: vi.fn(),
  
  },
}));

vi.mock('@/utils/clipboard', async () => {
  const actual = await vi.importActual<typeof import('@/utils/clipboard')>('@/utils/clipboard');
  return {
    ...actual,
    copyToClipboard: vi.fn(() => Promise.resolve()),
  };
});

function object(id: string, sortOrder: number): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: sortOrder,
    version: 1,
    params: { name: `Труба ${sortOrder}` },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
  };
}

function dispatchCopy(options: { metaKey?: boolean; ctrlKey?: boolean } = { ctrlKey: true }) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
    }));
  });
}

describe('useElecCalcSelectedRowsClipboardEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('copies selected visible rows as TSV and reports copied row count', async () => {
    const electricalColumnCopyValue = vi.fn((key: string, obj: ProjectObject, index: number) =>
      `${key}:${obj.id}:${index}`,
    );
    renderHook(() => useElecCalcSelectedRowsClipboardEffect({
      objects: [object('object-1', 1), object('object-2', 2), object('object-3', 3)],
      selectedRowKeys: ['object-1', 'object-3'],
      visibleElectricalColumnMetas: [
        { key: 'object_name', title: 'Наименование' },
        { key: 'current', title: 'Ток, А' },
      ],
      electricalColumnCopyValue,
    }));

    dispatchCopy();

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith([
        'Наименование\tТок, А',
        'object_name:object-1:0\tcurrent:object-1:0',
        'object_name:object-3:2\tcurrent:object-3:2',
      ].join('\r\n'));
    });
    expect(message.success).toHaveBeenCalledWith('Скопировано строк: 2');
  });

  it('does not copy when no selected rows are visible', () => {
    renderHook(() => useElecCalcSelectedRowsClipboardEffect({
      objects: [object('object-1', 1)],
      selectedRowKeys: ['object-2'],
      visibleElectricalColumnMetas: [{ key: 'object_name', title: 'Наименование' }],
      electricalColumnCopyValue: vi.fn(),
    }));

    dispatchCopy({ metaKey: true });

    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });

  it('does not intercept copy while an input or textarea is focused', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    renderHook(() => useElecCalcSelectedRowsClipboardEffect({
      objects: [object('object-1', 1)],
      selectedRowKeys: ['object-1'],
      visibleElectricalColumnMetas: [{ key: 'object_name', title: 'Наименование' }],
      electricalColumnCopyValue: vi.fn(),
    }));

    dispatchCopy();

    expect(copyToClipboard).not.toHaveBeenCalled();

    input.remove();
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    textarea.focus();

    dispatchCopy();

    expect(copyToClipboard).not.toHaveBeenCalled();
  });
});
