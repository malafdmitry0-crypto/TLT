import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcBootViewState } from '@/pages/electrical/useElecCalcBootViewState';

function renderBootViewState(options: {
  search?: string;
  state?: unknown;
} = {}) {
  return renderHook(
    (props: Required<typeof options>) => useElecCalcBootViewState({
      location: {
        search: props.search,
        state: props.state,
      },
    }),
    {
      initialProps: {
        search: '',
        state: null,
        ...options,
      },
    },
  );
}

describe('useElecCalcBootViewState', () => {
  it('exposes the full cable type set regardless of commercial feature flag', () => {
    const { result } = renderBootViewState();

    expect(result.current.availableCableTypeKeys).toEqual([
      'self_regulating',
      'self_regulating_tt',
      'single_core',
      'three_core',
    ]);
    expect(result.current.availableCableTypes.has('self_regulating_tt')).toBe(true);
    expect(result.current.availableCableTypes.has('single_core')).toBe(true);
    expect(result.current.availableCableTypes.has('three_core')).toBe(true);
  });

  it('resolves main table engine, glide flag and navigation active job from route state', () => {
    const { result } = renderBootViewState({
      search: '?electricalTableEngine=table',
      state: { activeJobId: 'job-123' },
    });

    expect(result.current.electricalTableEngine).toBe('table');
    expect(result.current.electricalGlideEnabled).toBe(false);
    expect(result.current.navigationActiveJobId).toBe('job-123');
  });
});
