import type { ElectricalVariantSetTask } from '@/api/electricalVariantSetTasks';
import { TltAlert, TltButton } from '@/components/ui-kit';

const STAGE_LABELS: Record<string, string> = {
  queued: 'в очереди',
  electrical: 'электротехнический расчёт',
  done: 'завершение',
};

export function ElectricalVariantSetTaskBanner({
  task,
  cancelPending,
  onCancel,
}: {
  task: ElectricalVariantSetTask;
  cancelPending: boolean;
  onCancel: () => void;
}) {
  const progress = task.progress.percent == null
    ? null
    : ` · ${Math.round(task.progress.percent)}%`;

  return (
    <TltAlert
      tone="info"
      title="Выполняется пересчёт явно выбранных ЭР"
      action={(
        <TltButton size="compact" loading={cancelPending} onClick={onCancel}>
          Отменить
        </TltButton>
      )}
    >
      Этап: {STAGE_LABELS[task.stage] ?? task.stage}{progress}.
      Изменения расчётных данных заблокированы на frontend и backend.
    </TltAlert>
  );
}
