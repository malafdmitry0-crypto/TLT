import { useRef, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { startElectricalVariantSetTask } from '@/api/electricalVariantSetTasks';
import { appMessage as message } from '@/feedback/appFeedback';
import { TltButton, TltModal } from '@/components/ui-kit';
import type { ElectricalVariant } from '@/types/electricalVariant';
import { projectElectricalVariantSetTaskQueryKey } from '@/hooks/useProjectElectricalVariantSetTask';
import './electrical-variant-set-action.css';

export function ElectricalVariantSetAction({
  projectId,
  variants,
  canMutate,
  disabled,
  disabledReason,
}: {
  projectId: string;
  variants: ElectricalVariant[];
  canMutate: boolean;
  disabled: boolean;
  disabledReason?: string | null;
}) {
  const queryClient = useQueryClient();
  const submitInFlightRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.map((id) => variants.find((item) => item.id === id)).filter(Boolean);
  const mutation = useMutation({
    mutationFn: (snapshot: string[]) => startElectricalVariantSetTask(projectId, snapshot),
    onSuccess: (task) => {
      queryClient.setQueryData(projectElectricalVariantSetTaskQueryKey(projectId), task);
      setOpen(false);
      setSelectedIds([]);
      message.info(`Пересчёт ${task.electrical_variant_ids.length} ЭР поставлен в очередь`);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось запустить пересчёт ЭР');
    },
    onSettled: () => {
      submitInFlightRef.current = false;
    },
  });
  const available = variants.filter((item) => item.legacy_variant_number != null);

  return (
    <>
      <TltButton
        size="compact"
        icon={<ReloadOutlined />}
        aria-label={`Пересчитать выбранные ЭР (${selectedIds.length})`}
        disabled={!canMutate || disabled || available.length === 0}
        title={disabledReason ?? undefined}
        loading={mutation.isPending}
        onClick={() => setOpen(true)}
      >
        Пересчитать выбранные ЭР ({selectedIds.length})
      </TltButton>
      <TltModal
        open={open}
        title="Явный выбор ЭР для пересчёта"
        okText={`Пересчитать выбранные ЭР (${selectedIds.length})`}
        cancelText="Отмена"
        okButtonProps={{ disabled: selectedIds.length === 0, loading: mutation.isPending }}
        closable={!mutation.isPending}
        maskClosable={!mutation.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => {
          if (submitInFlightRef.current || selectedIds.length === 0) return;
          submitInFlightRef.current = true;
          mutation.mutate([...selectedIds]);
        }}
      >
        <div className="electrical-variant-set-stack">
          <p className="electrical-variant-set-hint">
            Отметьте каждый ЭР, который нужно пересчитать. Ничего не выбрано по умолчанию.
          </p>
          <div className="electrical-variant-set-options" role="group" aria-label="Выбор ЭР для пересчёта">
            {available.map((variant) => (
              <label className="electrical-variant-set-option" key={variant.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(variant.id)}
                  onChange={(event) => setSelectedIds((current) => (
                    event.target.checked
                      ? [...current, variant.id]
                      : current.filter((id) => id !== variant.id)
                  ))}
                />
                <span>{variant.name}</span>
              </label>
            ))}
          </div>
          {selected.length >= 2 && (
            <strong>
              Подтвердите точный scope: {selected.map((item) => item?.name).join(', ')}.
            </strong>
          )}
        </div>
      </TltModal>
    </>
  );
}
