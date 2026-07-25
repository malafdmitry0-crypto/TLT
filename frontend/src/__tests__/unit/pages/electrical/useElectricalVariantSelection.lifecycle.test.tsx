import {
  apiMocks,
  ER_1,
  ER_1_ID,
  ER_2,
  ER_2_ID,
  ER_3,
  ER_3_ID,
  PROJECT_ID,
  UNKNOWN_ID,
  responseLost,
  setup,
} from './useElectricalVariantSelection.test-harness';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ElectricalVariant } from '@/types/electricalVariant';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';

describe('useElectricalVariantSelection — lifecycle mutations', () => {
  it('runs lifecycle calls with project and exact selected UUID and updates selection', async () => {
    let serverVariants = [ER_1, ER_2];
    apiMocks.list.mockImplementation(() => Promise.resolve(serverVariants));
    apiMocks.create.mockImplementation(async () => {
      serverVariants = [...serverVariants, ER_3];
      return ER_3;
    });
    apiMocks.copy.mockImplementation(async () => {
      const copy = { ...ER_3, id: UNKNOWN_ID, name: 'Копия решения' };
      serverVariants = [...serverVariants, copy];
      return copy;
    });
    apiMocks.rename.mockImplementation(async (_projectId, id, payload) => {
      const renamed = { ...serverVariants.find((item) => item.id === id)!, name: payload.name };
      serverVariants = serverVariants.map((item) => item.id === id ? renamed : item);
      return renamed;
    });
    apiMocks.activate.mockImplementation(async (_projectId, id) => {
      serverVariants = serverVariants.map((item) => ({ ...item, is_active: item.id === id }));
      return serverVariants.find((item) => item.id === id)!;
    });
    apiMocks.remove.mockImplementation(async (_projectId, id) => {
      serverVariants = serverVariants
        .filter((item) => item.id !== id)
        .map((item) => ({ ...item, is_active: item.id === ER_1_ID }));
      return {
        project_id: PROJECT_ID,
        deleted_variant_id: id,
        active_variant_id: ER_1_ID,
      };
    });
    const rendered = setup(`/workspace/elec-calc?er=${ER_2_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariant?.id).toBe(ER_2_ID));
    rendered.queryClient.setQueryData(
      [...electricalDataQueryKeys.variant(PROJECT_ID, UNKNOWN_ID), 'query'],
      { foreign: true },
    );

    await act(async () => {
      await rendered.result.current.createVariant('Резерв');
    });
    expect(apiMocks.create).toHaveBeenCalledWith(
      PROJECT_ID,
      { name: 'Резерв' },
      expect.any(String),
    );
    expect(rendered.result.current.selectedVariantId).toBe(ER_3_ID);

    await act(async () => {
      await rendered.result.current.renameVariant(ER_3_ID, 'Новый резерв');
      await rendered.result.current.activateVariant(ER_3_ID);
      await rendered.result.current.copySelectedVariant('Копия решения');
    });
    expect(apiMocks.rename).toHaveBeenCalledWith(PROJECT_ID, ER_3_ID, {
      name: 'Новый резерв',
    });
    expect(apiMocks.activate).toHaveBeenCalledWith(PROJECT_ID, ER_3_ID);
    expect(apiMocks.copy).toHaveBeenCalledWith(PROJECT_ID, ER_3_ID, {
      name: 'Копия решения',
    }, expect.any(String));
    expect(rendered.result.current.selectedVariantId).toBe(UNKNOWN_ID);

    await act(async () => {
      await rendered.result.current.deleteVariant(UNKNOWN_ID);
    });
    expect(apiMocks.remove).toHaveBeenCalledWith(PROJECT_ID, UNKNOWN_ID);
    expect(rendered.result.current.selectedVariantId).toBe(ER_1_ID);
    expect(
      rendered.queryClient.getQueriesData({
        queryKey: electricalDataQueryKeys.variant(PROJECT_ID, UNKNOWN_ID),
      }),
    ).toEqual([]);
  });

  it('surfaces and clears lifecycle mutation errors', async () => {
    apiMocks.create.mockRejectedValue(new Error('Достигнут лимит ЭР'));
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.selectedVariant).not.toBeNull());

    await act(async () => {
      await expect(rendered.result.current.createVariant()).rejects.toThrow('Достигнут лимит ЭР');
    });
    expect(rendered.result.current.mutationError).toEqual(new Error('Достигнут лимит ЭР'));

    act(() => rendered.result.current.clearMutationError());
    expect(rendered.result.current.mutationError).toBeNull();
  });

  it('reconciles the authoritative lifecycle list after a response-lost mutation error', async () => {
    let serverVariants = [ER_1, ER_2];
    apiMocks.list.mockImplementation(async () => serverVariants);
    apiMocks.create
      .mockImplementationOnce(async () => {
        serverVariants = [...serverVariants, ER_3];
        throw responseLost('Ответ create потерян');
      })
      .mockImplementationOnce(async () => ER_3);
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.variants).toHaveLength(2));

    await act(async () => {
      await expect(rendered.result.current.createVariant('Резерв')).resolves.toEqual(ER_3);
    });

    expect(rendered.result.current.variants.map((item) => item.id)).toContain(ER_3_ID);
    expect(apiMocks.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rendered.result.current.isMutating).toBe(false);
    expect(rendered.result.current.mutationError).toBeNull();
    expect(rendered.result.current.mutationNotice).toBeNull();
  });

  it('automatically replays one create intent with the same key after a lost response', async () => {
    let serverVariants: ElectricalVariant[] = [ER_1, ER_2];
    apiMocks.list.mockImplementation(async () => serverVariants);
    apiMocks.create
      .mockImplementationOnce(async () => {
        throw responseLost('Ответ create потерян');
      })
      .mockImplementationOnce(async () => {
        serverVariants = [...serverVariants, ER_3];
        return ER_3;
      });
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.variants).toHaveLength(2));

    await act(async () => {
      await rendered.result.current.createVariant('  Резерв  ');
    });

    expect(apiMocks.create).toHaveBeenCalledTimes(2);
    expect(apiMocks.create.mock.calls[1]?.[2]).toBe(apiMocks.create.mock.calls[0]?.[2]);
    expect(rendered.result.current.variants.filter((item) => item.id === ER_3_ID)).toHaveLength(1);
  });

  it('never mistakes a concurrent foreign create for a locally rejected create', async () => {
    const foreignFifth = {
      ...ER_3,
      id: UNKNOWN_ID,
      name: 'Чужой пятый ЭР',
      legacy_variant_number: null,
    };
    let listCalls = 0;
    apiMocks.list.mockImplementation(async () => {
      listCalls += 1;
      return listCalls === 1 ? [ER_1, ER_2, ER_3] : [ER_1, ER_2, ER_3, foreignFifth];
    });
    apiMocks.create.mockRejectedValue(Object.assign(
      new Error('Достигнут лимит ЭР'),
      { status: 409 },
    ));
    const rendered = setup();
    await waitFor(() => expect(rendered.result.current.variants).toHaveLength(3));

    await act(async () => {
      await expect(rendered.result.current.createVariant())
        .rejects.toThrow('Достигнут лимит ЭР');
    });

    expect(apiMocks.create).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.mutationNotice).toBeNull();
    expect(rendered.result.current.mutationError).toMatchObject({ status: 409 });
    expect(rendered.result.current.selectedVariantId).not.toBe(foreignFifth.id);
  });

  it('does not report a false failure when rename or delete is proven by reconciliation', async () => {
    let serverVariants: ElectricalVariant[] = [ER_1, ER_2];
    apiMocks.list.mockImplementation(async () => serverVariants);
    apiMocks.rename.mockImplementation(async (_projectId, id, payload) => {
      serverVariants = serverVariants.map((item) => (
        item.id === id ? { ...item, name: payload.name } : item
      ));
      throw new Error('Ответ rename потерян');
    });
    apiMocks.remove.mockImplementation(async (_projectId, id) => {
      serverVariants = serverVariants.filter((item) => item.id !== id);
      throw new Error('Ответ delete потерян');
    });
    const rendered = setup(`/workspace/elec-calc?er=${ER_2_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_2_ID));

    await act(async () => {
      await expect(rendered.result.current.renameVariant(ER_2_ID, 'Сверенное имя'))
        .resolves.toMatchObject({ id: ER_2_ID, name: 'Сверенное имя' });
    });
    expect(rendered.result.current.mutationError).toBeNull();
    expect(rendered.result.current.mutationNotice).toMatch(/Название ЭР сохранено/i);

    await act(async () => {
      await expect(rendered.result.current.deleteVariant(ER_2_ID)).resolves.toBeUndefined();
    });
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_1_ID));
    expect(rendered.result.current.mutationError).toBeNull();
    expect(rendered.result.current.mutationNotice).toMatch(/ЭР удалён/i);
  });

  it('reuses the same copy idempotency key when the same failed intent is retried', async () => {
    apiMocks.copy
      .mockRejectedValueOnce(responseLost('Ответ потерян'))
      .mockRejectedValueOnce(responseLost('Ответ снова потерян'))
      .mockResolvedValueOnce({ ...ER_2, id: UNKNOWN_ID, name: 'Копия' });
    const rendered = setup(`/workspace/elec-calc?er=${ER_2_ID}`);
    await waitFor(() => expect(rendered.result.current.selectedVariantId).toBe(ER_2_ID));

    await act(async () => {
      await expect(rendered.result.current.copySelectedVariant('  Копия  '))
        .rejects.toThrow('Ответ снова потерян');
    });
    await act(async () => {
      await rendered.result.current.copySelectedVariant('Копия');
    });

    const firstKey = apiMocks.copy.mock.calls[0]?.[3];
    const automaticRetryKey = apiMocks.copy.mock.calls[1]?.[3];
    const retryKey = apiMocks.copy.mock.calls[2]?.[3];
    expect(firstKey).toEqual(expect.any(String));
    expect(automaticRetryKey).toBe(firstKey);
    expect(retryKey).toBe(firstKey);
  });

});
