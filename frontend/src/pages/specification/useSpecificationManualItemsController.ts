/**
 * @module specification/manual-items-controller
 * @owner specification
 * Manual accessory add/delete/save for Specification page.
 * Generation and query/session remain in sibling owners.
 */
import { useMemo } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { saveSpecificationItems } from '@/api/specifications';
import type { SpecificationItem } from '@/types/specification';
import type { useSpecPageFormState } from '@/pages/specification/useSpecPageFormState';

type SpecificationMutationScope = {
  projectId: string;
  electricalVariantId: string;
  electricalVariantName: string;
  queryKey: readonly unknown[];
};

type SaveSpecificationVariables = SpecificationMutationScope & {
  items: SpecificationItem[];
};

type AccessoryLike = {
  id: string;
  category: string;
  name: string;
  article: string | null;
};

export function useSpecificationManualItemsController({
  canManuallyEdit,
  accessories,
  specItems,
  form,
  snapshotMutationScope,
}: {
  canManuallyEdit: boolean;
  accessories: AccessoryLike[];
  specItems: unknown;
  form: ReturnType<typeof useSpecPageFormState>;
  snapshotMutationScope: () => SpecificationMutationScope;
}) {
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: ({
      projectId,
      electricalVariantId,
      items,
    }: SaveSpecificationVariables) => {
      if (!canManuallyEdit) {
        throw new Error('Недостаточно прав для ручного изменения спецификации');
      }
      return saveSpecificationItems(
        projectId,
        electricalVariantId,
        items.filter((item) => item.source === 'manual'),
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: variables.queryKey, exact: true });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const items: SpecificationItem[] = useMemo(
    () => (specItems as SpecificationItem[]) ?? [],
    [specItems],
  );

  const handleAdd = () => {
    if (!canManuallyEdit) return;
    const acc = accessories.find((a) => a.id === form.selectedAccessoryId);
    if (!acc || !form.qty || form.qty <= 0) return;
    const newItem: SpecificationItem = {
      category: acc.category,
      name: acc.name,
      article: acc.article,
      unit: 'шт.',
      quantity: form.qty,
      params: { source_id: acc.id },
      source: 'manual',
    };
    saveMut.mutate({
      ...snapshotMutationScope(),
      items: [...items.filter((item) => item.source === 'manual'), newItem],
    }, {
      onSuccess: () => {
        message.success('Позиция добавлена');
        form.setAddOpen(false);
        form.setSelectedAccessoryId(null);
        form.setQty(1);
      },
    });
  };

  const handleDelete = (index: number) => {
    if (!canManuallyEdit) return;
    if (items[index]?.source !== 'manual') return;
    const next = items
      .filter((_, i) => i !== index)
      .filter((item) => item.source === 'manual');
    saveMut.mutate({
      ...snapshotMutationScope(),
      items: next,
    }, {
      onSuccess: () => message.success('Позиция удалена'),
    });
  };

  return {
    saveMut,
    items,
    handleAdd,
    handleDelete,
    hasItems: items.length > 0,
  };
}
